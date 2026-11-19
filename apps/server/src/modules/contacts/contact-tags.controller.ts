import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CONTACT_GROUP_MEMBERS_MAX } from '@estate-erp/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ContactTagsService } from './contact-tags.service';

class ContactTagContactsDto {
  @IsString()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTACT_GROUP_MEMBERS_MAX)
  @IsUUID(undefined, { each: true })
  contactIds!: string[];
}

class UpdateContactTagDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  newName?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

// 태그 이름에 '/'가 들어갈 수 있어 경로 대신 본문과 쿼리로 이름을 받는다 (그룹과 같은 방식).
@ApiTags('연락처 태그')
@ApiBearerAuth()
@Controller('contact-tags')
@UseGuards(JwtAuthGuard)
export class ContactTagsController {
  constructor(private readonly contactTags: ContactTagsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.contactTags.list(user.officeId);
  }

  @Post('assign')
  assign(
    @Body() dto: ContactTagContactsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactTags.assign(
      user.officeId,
      dto.name,
      dto.contactIds,
      user.userId,
    );
  }

  @Post('unassign')
  unassign(
    @Body() dto: ContactTagContactsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactTags.unassign(user.officeId, dto.name, dto.contactIds);
  }

  @Patch()
  update(
    @Body() dto: UpdateContactTagDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactTags.update(user.officeId, dto.name, {
      newName: dto.newName,
      color: dto.color,
    });
  }

  @Delete()
  remove(
    @Query('name') name: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactTags.remove(user.officeId, name);
  }
}
