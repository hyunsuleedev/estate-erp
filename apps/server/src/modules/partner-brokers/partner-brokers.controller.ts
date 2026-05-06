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
import { PartnerBrokersService } from './partner-brokers.service';

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
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      name: string;
      phone?: string;
      ceoName?: string;
      ceoPhone?: string;
      licenseNo?: string;
      email?: string;
      address?: string;
      memo?: string;
      linkedOfficeId?: string;
    },
  ) {
    return this.service.create(user.officeId, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: Partial<{
      name: string;
      phone: string | null;
      ceoName: string | null;
      ceoPhone: string | null;
      licenseNo: string | null;
      email: string | null;
      address: string | null;
      memo: string | null;
      isActive: boolean;
    }>,
  ) {
    return this.service.update(id, user.officeId, body);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
