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
import { ContactRelationsService } from './contact-relations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import {
  ContactRelationQueryDto,
  CreateContactRelationDto,
  CreateContactRelationWithNewContactDto,
  UpdateContactRelationDto,
} from './dto/contact-relation.dto';

@ApiTags('연락처 관계')
@ApiBearerAuth()
@Controller('contact-relations')
@UseGuards(JwtAuthGuard)
export class ContactRelationsController {
  constructor(private readonly service: ContactRelationsService) {}

  @Get()
  findByContact(
    @Query() query: ContactRelationQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findByContact(user.officeId, query.contactId);
  }

  @Post()
  create(
    @Body() dto: CreateContactRelationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, dto);
  }

  @Post('with-contact')
  createWithNewContact(
    @Body() dto: CreateContactRelationWithNewContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createWithNewContact(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactRelationDto,
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
