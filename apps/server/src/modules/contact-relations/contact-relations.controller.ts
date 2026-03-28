import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ContactRelationsService } from './contact-relations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('연락처 관계')
@ApiBearerAuth()
@Controller('contact-relations')
@UseGuards(JwtAuthGuard)
export class ContactRelationsController {
  constructor(private readonly service: ContactRelationsService) {}

  @Get()
  findByContact(
    @Query('contactId') contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findByContact(user.officeId, contactId);
  }

  @Post()
  create(
    @Body()
    dto: {
      contactId: string;
      relatedContactId: string;
      relationType: string;
      label?: string;
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
      contactId: string;
      relationType: string;
      label?: string;
      phone: string;
      name?: string;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createWithNewContact(user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
