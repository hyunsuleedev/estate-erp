import {
  BadRequestException,
  ParseUUIDPipe,
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
import {
  CONTACT_CATEGORY_KEYS,
  ContactKind,
  ConsultationScope,
  type ContactCategoryKey,
} from '@estate-erp/shared';
import { ContactPhoneInput, ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/** 주소의 id 형식이 틀리면 DB까지 가지 않고 400으로 돌려준다 (그대로 두면 500이 난다). */
const ContactIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('잘못된 연락처 주소입니다.'),
});

@ApiTags('연락처')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  findAll(
    @Query('search') search: string,
    @Query('kind') kind: string,
    @Query('tags') tags: string,
    @Query('group') group: string,
    @Query('category') category: string,
    @Query('hasPropertyContact') hasPropertyContact: string,
    @Query('hasBuyerReq') hasBuyerReq: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // 분류는 쉼표로 여러 개를 줄 수 있고, 모두 만족하는 연락처만 돌려준다
    // (예: owner,in_deal = 소유자이면서 거래 진행 중).
    const categories = category
      ? Array.from(
          new Set(
            category
              .split(',')
              .map((key) => key.trim())
              .filter(Boolean),
          ),
        )
      : [];
    if (
      categories.some(
        (key) => !CONTACT_CATEGORY_KEYS.includes(key as ContactCategoryKey),
      )
    ) {
      throw new BadRequestException('알 수 없는 연락처 분류입니다.');
    }
    return this.contactsService.findAll(user.officeId, {
      search: search || undefined,
      kind:
        kind === ContactKind.PERSON || kind === ContactKind.ORGANIZATION
          ? kind
          : undefined,
      tags: tags ? tags.split(',') : undefined,
      group: group || undefined,
      categories:
        categories.length > 0 ? (categories as ContactCategoryKey[]) : undefined,
      hasPropertyContact: hasPropertyContact === 'true' || undefined,
      hasBuyerReq: hasBuyerReq === 'true' || undefined,
      sortBy: (sortBy as 'name' | 'createdAt' | 'updatedAt') || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('categories')
  getCategorySummary(@CurrentUser() user: CurrentUserPayload) {
    return this.contactsService.getCategorySummary(user.officeId);
  }

  @Get('phone-index')
  getPhoneIndex(@CurrentUser() user: CurrentUserPayload) {
    return this.contactsService.getPhoneIndex(user.officeId);
  }

  @Get('search-by-phone')
  findByPhone(
    @Query('phone') phone: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!phone?.trim() || phone.trim().length < 4) return [];
    return this.contactsService.findByPhone(user.officeId, phone);
  }

  @Get(':id')
  findOne(
    @Param('id', ContactIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.findOne(id, user.officeId);
  }

  @Get(':id/property-contacts')
  getPropertyContacts(
    @Param('id', ContactIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getPropertyContacts(id, user.officeId);
  }

  @Get(':id/buyer-requirements')
  getBuyerRequirements(
    @Param('id', ContactIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getBuyerRequirements(id, user.officeId);
  }

  /** 이 사람과 한 일: 거래 · 계약서 · 연결한 매물 · 다가오는 임장 · 열린 업무 */
  @Get(':id/overview')
  getOverview(
    @Param('id', ContactIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getOverview(id, user.officeId, { userId: user.userId, role: user.role });
  }

  /** 지우기 전에: 지울 수 있는지, 지우면 무엇이 함께 지워지고 무엇이 남는지 */
  @Get(':id/delete-check')
  getDeleteCheck(
    @Param('id', ContactIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getDeleteCheck(id, user.officeId);
  }

  @Get(':id/consultations')
  getConsultations(
    @Param('id', ContactIdPipe) id: string,
    @Query('scope') scope: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const resolvedScope =
      scope === ConsultationScope.PARTY ? ConsultationScope.PARTY : ConsultationScope.SELF;
    return this.contactsService.getConsultations(id, user.officeId, resolvedScope);
  }

  @Post()
  create(
    @Body()
    dto: {
      kind?: ContactKind;
      name: string;
      businessRegNo?: string | null;
      referredByContactId?: string | null;
      phone?: string;
      phones?: ContactPhoneInput[];
      email?: string;
      tags?: string[];
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.create(user.officeId, dto, user.userId);
  }

  @Patch(':id')
  update(
    @Param('id', ContactIdPipe) id: string,
    @Body()
    dto: {
      kind?: ContactKind;
      name?: string;
      businessRegNo?: string | null;
      referredByContactId?: string | null;
      phone?: string;
      phones?: ContactPhoneInput[];
      email?: string;
      tags?: string[];
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.update(id, user.officeId, dto, user.userId);
  }

  /** 합치기 전 미리보기: 합칠 수 없는 이유 · 옮겨지는 것 · 겹쳐서 버려지는 것 */
  @Get(':id/merge-check')
  getMergeCheck(
    @Param('id', ContactIdPipe) id: string,
    @Query('into') into: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.getMergeCheck(id, into, user.officeId);
  }

  /** 같은 사람이 두 번 등록됐을 때: 이 연락처(:id)의 기록을 모두 intoContactId로 옮기고 이 연락처를 지운다 */
  @Post(':id/merge')
  merge(
    @Param('id', ContactIdPipe) id: string,
    @Body() dto: { intoContactId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.merge(id, dto?.intoContactId, user.officeId, user.userId);
  }

  @Delete(':id')
  remove(
    @Param('id', ContactIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.remove(id, user.officeId);
  }
}
