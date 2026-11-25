import {
  NotFoundException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { PartnerBrokersService } from './partner-brokers.service';
import {
  CreatePartnerBrokerContactDto,
  CreatePartnerBrokerDto,
  UpdatePartnerBrokerContactDto,
  UpdatePartnerBrokerDto,
} from './partner-brokers.dto';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException('파트너 사무소를 찾을 수 없습니다.'),
});

@ApiTags('Partner Brokers')
@ApiBearerAuth()
@Controller('partner-brokers')
@UseGuards(JwtAuthGuard)
export class PartnerBrokersController {
  constructor(private readonly service: PartnerBrokersService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.list(user.officeId, includeInactive === 'true');
  }

  @Get(':id')
  findOne(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreatePartnerBrokerDto,
  ) {
    return this.service.create(user.officeId, body);
  }

  @Patch(':id')
  update(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: UpdatePartnerBrokerDto,
  ) {
    return this.service.update(id, user.officeId, body);
  }

  @Delete(':id')
  remove(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }

  @Post(':id/contacts')
  addContact(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreatePartnerBrokerContactDto,
  ) {
    return this.service.addContact(id, user.officeId, body);
  }

  @Patch(':id/contacts/:contactId')
  updateContact(
    @Param('id', uuidPipe) id: string,
    @Param('contactId', uuidPipe) contactId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: UpdatePartnerBrokerContactDto,
  ) {
    return this.service.updateContact(id, contactId, user.officeId, body);
  }

  @Delete(':id/contacts/:contactId')
  removeContact(
    @Param('id', uuidPipe) id: string,
    @Param('contactId', uuidPipe) contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeContact(id, contactId, user.officeId);
  }
}
