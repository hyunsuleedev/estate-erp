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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

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
    @Query('propertyId') propertyId: string,
    @Query('siteId') siteId: string,
    @Query('dongId') dongId: string,
    @Query('unitId') unitId: string,
    @Query('listingIntakeId') listingIntakeId: string,
    @Query('listingId') listingId: string,
    @Query('matchId') matchId: string,
    @Query('buyerReqId') buyerReqId: string,
    @Query('context') context: string,
    @Query('outcome') outcome: string,
    @Query('type') type: string,
    @Query('createdById') createdById: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(user.officeId, {
      q: q || undefined,
      contactId: contactId || undefined,
      propertyId: propertyId || undefined,
      siteId: siteId || undefined,
      dongId: dongId || undefined,
      unitId: unitId || undefined,
      listingIntakeId: listingIntakeId || undefined,
      listingId: listingId || undefined,
      matchId: matchId || undefined,
      buyerReqId: buyerReqId || undefined,
      context: (context as 'property' | 'listingIntake' | 'listing' | 'match' | 'buyerRequirement' | 'unlinked') || undefined,
      outcome: (outcome as 'actionRequired' | 'confirmed' | 'held') || undefined,
      type: type || undefined,
      createdById: createdById || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
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
    @Body()
    dto: {
      contactId: string;
      type: string;
      purpose?: string;
      content: string;
      propertyId?: string;
      listingIntakeId?: string;
      listingId?: string;
      matchId?: string;
      buyerReqId?: string;
      callRecordingId?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      type?: string;
      content?: string;
    },
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
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createWithRecording(
      user.officeId,
      user.userId,
      {
        contactId,
        type: type || 'phone',
        direction: direction || 'inbound',
        phoneNumber: phoneNumber || '',
        durationSec: durationSec ? Number(durationSec) : 0,
      },
      file,
    );
  }

  @Get(':id/stt-status')
  getSttStatus(
    @Param('id') id: string,
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
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findRecordings(user.officeId, {
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
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findRecording(id, user.officeId);
  }

  @Patch('recordings/:id')
  updateRecording(
    @Param('id') id: string,
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
