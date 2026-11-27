import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/** 주소의 id 형식이 틀리면 DB까지 가지 않고 400으로 돌려준다 (그대로 두면 500이 났다). 연락처의 ContactIdPipe와 같다. */
const ConsultationIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('잘못된 상담 주소입니다.'),
});

@ApiTags('상담')
@ApiBearerAuth()
@Controller('consultations')
@UseGuards(JwtAuthGuard)
export class ConsultationsController {
  constructor(private readonly service: ConsultationsService) {}

  @Get('recent')
  getRecent(
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getRecent(user.officeId, limit ? Number(limit) : undefined);
  }

  @Get()
  findAll(
    @Query('q') q: string,
    @Query('contactId') contactId: string,
    @Query('scope') scope: string,
    @Query('propertyId') propertyId: string,
    @Query('siteId') siteId: string,
    @Query('dongId') dongId: string,
    @Query('unitId') unitId: string,
    @Query('listingIntakeId') listingIntakeId: string,
    @Query('buyerIntakeId') buyerIntakeId: string,
    @Query('dealId') dealId: string,
    @Query('projectId') projectId: string,
    @Query('context') context: string,
    @Query('outcome') outcome: string,
    @Query('type') type: string,
    @Query('createdById') createdById: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('recording') recording: string,
    @Query('suggestions') suggestions: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(user.officeId, {
      q: q || undefined,
      contactId: contactId || undefined,
      scope: scope === 'party' ? 'party' : scope === 'self' ? 'self' : undefined,
      propertyId: propertyId || undefined,
      siteId: siteId || undefined,
      dongId: dongId || undefined,
      unitId: unitId || undefined,
      listingIntakeId: listingIntakeId || undefined,
      buyerIntakeId: buyerIntakeId || undefined,
      dealId: dealId || undefined,
      projectId: projectId || undefined,
      context:
        (context as
          | 'property'
          | 'listingIntake'
          | 'buyerIntake'
          | 'deal'
          | 'project'
          | 'unlinked') || undefined,
      outcome: (outcome as 'actionRequired' | 'confirmed' | 'held') || undefined,
      type: type || undefined,
      createdById: createdById || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      recording:
        recording === 'with' || recording === 'without' ? recording : undefined,
      suggestions: suggestions === 'pending' ? 'pending' : undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ConsultationIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      contactId: string;
      type: string;
      purpose?: string;
      content: string;
      propertyId?: string;
      listingIntakeId?: string;
      buyerIntakeId?: string;
      dealId?: string;
      projectId?: string;
      callRecordingId?: string;
      /** 상담한 때 (ISO). 비우면 지금 */
      consultedAt?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ConsultationIdPipe) id: string,
    @Body()
    dto: {
      type?: string;
      content?: string;
      consultedAt?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ConsultationIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }

  // ================================================================
  // 녹음 + STT
  // ================================================================

  @Post('with-recording')
  @UseInterceptors(FileInterceptor('file'))
  createWithRecording(
    @UploadedFile() file: Express.Multer.File,
    @Body('contactId') contactId: string,
    @Body('type') type: string,
    @Body('direction') direction: string,
    @Body('phoneNumber') phoneNumber: string,
    @Body('durationSec') durationSec: string,
    @Body('calledAt') calledAt: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createWithRecording(
      user.officeId,
      user.userId,
      {
        contactId: contactId || undefined,
        type: type || 'phone',
        direction: direction || 'inbound',
        phoneNumber: phoneNumber || '',
        durationSec: durationSec ? Number(durationSec) : 0,
        calledAt: calledAt || undefined,
      },
      file,
    );
  }

  /** 이미 적어 둔 상담에 녹음을 붙인다 (방문 메모에 나중에 녹음을 올리는 경우) */
  @Post(':id/recording')
  @UseInterceptors(FileInterceptor('file'))
  attachRecordingToConsultation(
    @Param('id', ConsultationIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('durationSec') durationSec: string,
    @Body('calledAt') calledAt: string,
    @Body('direction') direction: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.attachRecordingToConsultation(
      id,
      user.officeId,
      user.userId,
      {
        durationSec: durationSec ? Number(durationSec) : 0,
        calledAt: calledAt || undefined,
        direction: direction || undefined,
      },
      file,
    );
  }

  /**
   * 자동 생성된 CallRecording에 녹음 파일 첨부 → STT 시작.
   * with-recording과 달리 새 레코드를 만들지 않아 통화당 1건이 유지된다.
   */
  @Post('recordings/:id/attach-file')
  @UseInterceptors(FileInterceptor('file'))
  attachRecordingFile(
    @Param('id', ConsultationIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('contactId') contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.attachRecordingFile(
      id,
      user.officeId,
      file,
      contactId || undefined,
    );
  }

  /** 받아쓰기는 그대로 두고 통화 분석(요약·업무 제안)만 다시 한다 */
  @Post('recordings/:id/reanalyze')
  reanalyzeRecording(
    @Param('id', ConsultationIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reanalyzeRecording(id, user.officeId);
  }

  @Get(':id/stt-status')
  getSttStatus(
    @Param('id', ConsultationIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getSttStatus(id, user.officeId);
  }

  // ================================================================
  // CallRecording 조회
  // ================================================================

  @Post('recordings')
  createRecording(
    @Body()
    dto: {
      direction: string;
      phoneNumber: string;
      durationSec?: number;
      contactId?: string;
      result?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createRecordingLog(
      user.officeId,
      user.userId,
      dto,
    );
  }

  @Get('recordings/list')
  findRecordings(
    @Query('contactId') contactId: string,
    @Query('direction') direction: string,
    @Query('sttStatus') sttStatus: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('q') q: string,
    @Query('unlinked') unlinked: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findRecordings(user.officeId, {
      unlinked: unlinked === 'true',
      contactId: contactId || undefined,
      direction: direction || undefined,
      sttStatus: sttStatus || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      q: q || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('recordings/:id')
  findRecording(
    @Param('id', ConsultationIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findRecording(id, user.officeId);
  }

  @Patch('recordings/:id')
  updateRecording(
    @Param('id', ConsultationIdPipe) id: string,
    @Body()
    dto: {
      contactId?: string | null;
      speakerLabels?: Array<{ speaker: number; label: string }>;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateRecording(id, user.officeId, dto);
  }
}
