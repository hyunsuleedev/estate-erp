import {
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
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AddHouseholdMemberDto,
  AddOrganizationMemberDto,
  AddPartyMemberDto,
  CreatePartyDto,
  UpdatePartyDto,
  UpdatePartyMemberDto,
} from './dto/party.dto';
import { PartiesService } from './parties.service';

@ApiTags('집단·소속 (세대/법인)')
@ApiBearerAuth()
@Controller('parties')
@UseGuards(JwtAuthGuard)
export class PartiesController {
  constructor(private readonly service: PartiesService) {}

  @Get('search')
  search(
    @CurrentUser() user: CurrentUserPayload,
    @Query('search') search?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.searchParties(user.officeId, {
      search,
      kind,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get()
  findByContact(
    @Query('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findByContact(user.officeId, contactId);
  }

  @Post()
  createParty(
    @Body() dto: CreatePartyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createParty(user.officeId, dto);
  }

  @Post('household-members')
  addHouseholdMember(
    @Body() dto: AddHouseholdMemberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addHouseholdMember(user.officeId, dto);
  }

  @Post('organization-members')
  addOrganizationMember(
    @Body() dto: AddOrganizationMemberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addOrganizationMember(user.officeId, dto);
  }

  @Post(':partyId/members')
  addMemberToParty(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Body() dto: AddPartyMemberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addMemberToParty(user.officeId, partyId, dto);
  }

  @Patch(':partyId')
  updateParty(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Body() dto: UpdatePartyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateParty(user.officeId, partyId, dto);
  }

  @Delete(':partyId')
  deleteParty(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.deleteParty(user.officeId, partyId);
  }

  @Patch(':partyId/members/:memberId')
  updateMember(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdatePartyMemberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateMember(user.officeId, partyId, memberId, dto);
  }

  @Delete(':partyId/members/:memberId')
  removeMember(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeMember(user.officeId, partyId, memberId);
  }
}
