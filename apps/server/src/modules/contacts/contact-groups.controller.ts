import {
  Body,
  Controller,
  Delete,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  ContactGroupMembersDto,
  CreateContactGroupDto,
  RenameContactGroupDto,
} from './contact-groups.dto';
import { ContactGroupsService } from './contact-groups.service';

// 그룹 이름에 '/'가 들어갈 수 있어(예: 매수/투자) 경로 대신 본문과 쿼리로 이름을 받는다.
@ApiTags('연락처 그룹')
@ApiBearerAuth()
@Controller('contact-groups')
@UseGuards(JwtAuthGuard)
export class ContactGroupsController {
  constructor(private readonly contactGroups: ContactGroupsService) {}

  @Post()
  create(
    @Body() dto: CreateContactGroupDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactGroups.create(user.officeId, dto.name, dto.contactIds);
  }

  @Patch()
  rename(
    @Body() dto: RenameContactGroupDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactGroups.rename(user.officeId, dto.name, dto.newName);
  }

  @Delete()
  remove(
    @Query('name') name: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactGroups.remove(user.officeId, name);
  }

  @Post('members')
  addMembers(
    @Body() dto: ContactGroupMembersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactGroups.addMembers(
      user.officeId,
      dto.name,
      dto.contactIds,
    );
  }

  @Post('members/remove')
  removeMembers(
    @Body() dto: ContactGroupMembersDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactGroups.removeMembers(
      user.officeId,
      dto.name,
      dto.contactIds,
    );
  }
}
