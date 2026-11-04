import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesSelectOrdered,
  normalizePhone,
  withPrimaryContactPhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import { parseCallRecordingFileName } from '@estate-erp/shared';
import { CallIntelligenceService } from '../call-intelligence/call-intelligence.service';

export interface ConsultationSearchQuery {
  q?: string;
  contactId?: string;
  propertyId?: string;
  siteId?: string;
  dongId?: string;
  unitId?: string;
  listingIntakeId?: string;
  listingId?: string;
  matchId?: string;
  buyerIntakeId?: string;
  buyerReqId?: string;
  context?:
    | 'property'
    | 'listingIntake'
    | 'listing'
    | 'match'
    | 'buyerIntake'
    | 'buyerRequirement'
    | 'unlinked';
  outcome?: 'actionRequired' | 'confirmed' | 'held';
  type?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callIntelligence: CallIntelligenceService,
  ) {}

  private readonly defaultInclude = {
    contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
    property: {
      // NOTE: Property 모델에는 memo 필드가 schema상 존재하지 않음 (docs/DATA_STRUCTURE.md와 불일치).
      // 별도 task로 추적 중. schema 기준으로 select 제한.
      select: {
        id: true,
        site: { select: { name: true } },
        unit: {
          select: {
            id: true,
            name: true,
            floor: true,
            lineNo: true,
            dong: { select: { id: true, name: true, isPlaceholder: true } },
          },
        },
      },
    },
    listingIntake: {
      select: {
        id: true,
        ...LISTING_INTAKE_STATE_SELECT,
        propertyId: true,
        receivedAt: true,
      },
    },
    listing: {
      select: {
        id: true,
        transactionType: true,
        price: true,
        isPaused: true,
        intake: { select: LISTING_INTAKE_STATE_SELECT },
        deals: OCCUPYING_DEALS_SELECT,
      },
    },
    match: { select: { id: true, stage: true } },
    buyerIntake: {
      select: { id: true, lifecycleStatus: true, receivedAt: true },
    },
    buyerRequirement: {
      select: {
        id: true,
        buyerIntakeId: true,
        status: true,
        transactionType: true,
      },
    },
    createdBy: { select: { id: true, name: true } },
  };

  async findAll(officeId: string, query: ConsultationSearchQuery = {}) {
    const filters: Prisma.ConsultationWhereInput[] = [{ officeId }];

    if (query.contactId) filters.push({ contactId: query.contactId });
    if (query.propertyId) filters.push({ propertyId: query.propertyId });
    if (query.siteId) filters.push({ property: { siteId: query.siteId } });
    if (query.dongId) filters.push({ property: { unit: { dongId: query.dongId } } });
    if (query.unitId) filters.push({ property: { unitId: query.unitId } });
    if (query.listingIntakeId) filters.push({ listingIntakeId: query.listingIntakeId });
    if (query.listingId) filters.push({ listingId: query.listingId });
    if (query.matchId) filters.push({ matchId: query.matchId });
    if (query.buyerIntakeId) {
      filters.push({ buyerIntakeId: query.buyerIntakeId });
    }
    if (query.buyerReqId) filters.push({ buyerReqId: query.buyerReqId });
    if (query.type) filters.push({ type: query.type });
    if (query.createdById) filters.push({ createdById: query.createdById });

    if (query.context) {
      filters.push(this.buildContextFilter(query.context));
    }

    if (query.outcome) {
      filters.push(this.buildOutcomeFilter(query.outcome));
    }

    if (query.dateFrom || query.dateTo) {
      filters.push({
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      });
    }

    const q = query.q?.trim();
    if (q) {
      const canonicalPhone = normalizePhone(q);
      filters.push({
        OR: [
          { content: { contains: q, mode: 'insensitive' } },
          { contact: { name: { contains: q, mode: 'insensitive' } } },
          ...(canonicalPhone
            ? [{ contact: { phones: { some: { phone: { contains: canonicalPhone } } } } }]
            : []),
          { property: { site: { name: { contains: q, mode: 'insensitive' } } } },
          { property: { unit: { name: { contains: q, mode: 'insensitive' } } } },
          { property: { unit: { dong: { name: { contains: q, mode: 'insensitive' } } } } },
          { listing: { transactionType: { contains: q, mode: 'insensitive' } } },
          { listing: { memo: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const where =
      filters.length === 1 ? filters[0] : ({ AND: filters } as Prisma.ConsultationWhereInput);
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.consultation.findMany({
        where,
        include: this.defaultInclude,
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.consultation.count({ where }),
    ]);

    return {
      items: items.map(withPrimaryContactPhone),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private buildContextFilter(context: NonNullable<ConsultationSearchQuery['context']>): Prisma.ConsultationWhereInput {
    if (context === 'property') return { propertyId: { not: null } };
    if (context === 'listingIntake') return { listingIntakeId: { not: null } };
    if (context === 'listing') return { listingId: { not: null } };
    if (context === 'match') return { matchId: { not: null } };
    if (context === 'buyerIntake') return { buyerIntakeId: { not: null } };
    if (context === 'buyerRequirement') return { buyerReqId: { not: null } };
    return {
      propertyId: null,
      listingIntakeId: null,
      listingId: null,
      matchId: null,
      buyerIntakeId: null,
      buyerReqId: null,
    };
  }

  private buildOutcomeFilter(outcome: NonNullable<ConsultationSearchQuery['outcome']>): Prisma.ConsultationWhereInput {
    const keywords =
      outcome === 'actionRequired'
        ? ['필요', '요청', '문의', '어떻게', '여부']
        : outcome === 'confirmed'
          ? ['확정', '수락', '입금 확인', '완료', '결정']
          : ['거절', '취소', '보류', '불가'];

    return {
      OR: keywords.map((keyword) => ({
        content: { contains: keyword, mode: 'insensitive' },
      })),
    };
  }

  async findOne(id: string, officeId: string) {
    const consultation = await this.prisma.consultation.findFirst({
      where: { id, officeId },
      include: this.defaultInclude,
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    return withPrimaryContactPhone(consultation);
  }

  async create(
    officeId: string,
    userId: string,
    dto: {
      contactId: string;
      type: string;
      purpose?: string;
      content: string;
      propertyId?: string;
      listingIntakeId?: string;
      listingId?: string;
      matchId?: string;
      buyerIntakeId?: string;
      buyerReqId?: string;
      /** 통화 녹음 연결 (통화 → 상담 전환) */
      callRecordingId?: string;
    },
  ) {
    const {
      propertyId,
      listingIntakeId,
      listingId,
      matchId,
      buyerIntakeId,
      buyerReqId,
      callRecordingId,
      ...rest
    } = dto;

    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, officeId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    let resolvedBuyerIntakeId = buyerIntakeId || undefined;
    if (buyerReqId) {
      const requirement = await this.prisma.buyerRequirement.findFirst({
        where: { id: buyerReqId, officeId },
        select: { id: true, buyerIntakeId: true },
      });
      if (!requirement) {
        throw new NotFoundException('BuyerRequirement not found');
      }
      if (
        resolvedBuyerIntakeId &&
        resolvedBuyerIntakeId !== requirement.buyerIntakeId
      ) {
        throw new BadRequestException(
          'BuyerRequirement가 지정한 BuyerIntake와 일치하지 않습니다.',
        );
      }
      resolvedBuyerIntakeId = requirement.buyerIntakeId;
    } else if (resolvedBuyerIntakeId) {
      const intake = await this.prisma.buyerIntake.findFirst({
        where: { id: resolvedBuyerIntakeId, officeId },
        select: { id: true },
      });
      if (!intake) throw new NotFoundException('BuyerIntake not found');
    }

    if (resolvedBuyerIntakeId) {
      const participant = await this.prisma.buyerIntakeContact.findFirst({
        where: {
          officeId,
          buyerIntakeId: resolvedBuyerIntakeId,
          contactId: dto.contactId,
        },
        select: { id: true },
      });
      if (!participant) {
        throw new BadRequestException(
          '상담 연락처를 BuyerIntake 참여자로 먼저 연결해야 합니다.',
        );
      }
    }

    // 통화 녹음 연결 시 같은 사무소 소유인지 확인
    if (callRecordingId) {
      const recording = await this.prisma.callRecording.findFirst({
        where: { id: callRecordingId, officeId },
        select: { id: true },
      });
      if (!recording) throw new NotFoundException('Recording not found');
    }

    return this.prisma.consultation
      .create({
        data: {
          officeId,
          createdById: userId,
          ...rest,
          propertyId: propertyId || undefined,
          listingIntakeId: listingIntakeId || undefined,
          listingId: listingId || undefined,
          matchId: matchId || undefined,
          buyerIntakeId: resolvedBuyerIntakeId,
          buyerReqId: buyerReqId || undefined,
          callRecordingId: callRecordingId || undefined,
        },
        include: this.defaultInclude,
      })
      .then(withPrimaryContactPhone);
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      type?: string;
      content?: string;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.consultation.update({
      where: { id },
      data: dto,
      include: this.defaultInclude,
    }).then(withPrimaryContactPhone);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.consultation.delete({ where: { id } });
  }

  async getRecent(officeId: string, limit = 10) {
    const consultations = await this.prisma.consultation.findMany({
      where: { officeId },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return consultations.map(withPrimaryContactPhone);
  }

  // ================================================================
  // CallRecording + STT
  // ================================================================

  /**
   * 녹음 파일 업로드 → CallRecording 생성 → 받아쓰기·분석(비동기).
   * 연락처·번호·통화 시각을 보내지 않으면 녹음 파일 이름(갤럭시 기본 통화 녹음 형식)에서 읽는다.
   * 분석이 끝나면 상담 기록이 자동으로 남고, 할 일·일정 등은 제안으로 붙는다.
   */
  async createWithRecording(
    officeId: string,
    userId: string,
    dto: {
      contactId?: string;
      type: string;
      direction?: string;
      phoneNumber?: string;
      durationSec?: number;
      calledAt?: string;
    },
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('녹음 파일이 필요합니다');
    const fromFileName = parseCallRecordingFileName(file.originalname);
    const phoneNumber =
      (dto.phoneNumber ? normalizePhone(dto.phoneNumber) : '') ||
      fromFileName.phoneNumber ||
      '';
    const contactId = await this.resolveRecordingContactId(
      officeId,
      dto.contactId,
      phoneNumber,
    );
    const calledAt =
      parseOptionalDate(dto.calledAt) ?? fromFileName.calledAt ?? new Date();

    const recording = await this.prisma.callRecording.create({
      data: {
        officeId,
        userId,
        contactId,
        direction: dto.direction === 'outbound' ? 'outbound' : 'inbound',
        phoneNumber,
        durationSec: dto.durationSec || 0,
        fileName: file.originalname,
        fileSize: file.size,
        sttStatus: 'processing',
        calledAt,
      },
    });

    this.callIntelligence.startTranscription(recording.id, file);

    return {
      recording: {
        id: recording.id,
        sttStatus: recording.sttStatus,
        fileName: recording.fileName,
        fileSize: recording.fileSize,
      },
      // 하위 호환: 기존 앱이 consultation 필드를 기대하므로
      consultation: { id: recording.id, content: '[녹음 분석 중...]' },
      sttStatus: 'processing',
      recordingFileName: file.originalname,
      recordingSize: file.size,
    };
  }

  /** 보낸 연락처를 확인하거나, 없으면 전화번호로 찾는다 */
  private async resolveRecordingContactId(
    officeId: string,
    contactId: string | undefined,
    phoneNumber: string,
  ): Promise<string | null> {
    if (contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId, officeId },
        select: { id: true },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      return contact.id;
    }
    if (!phoneNumber) return null;
    const contact = await this.prisma.contact.findFirst({
      where: { officeId, phones: { some: { phone: phoneNumber } } },
      select: { id: true },
    });
    return contact?.id ?? null;
  }

  /**
   * 자동 생성된 CallRecording에 녹음 파일 첨부 → STT 시작.
   */
  async attachRecordingFile(
    id: string,
    officeId: string,
    file: Express.Multer.File,
    contactId?: string,
  ) {
    const recording = await this.prisma.callRecording.findFirst({
      where: { id, officeId },
    });
    if (!recording) throw new NotFoundException('Recording not found');
    if (recording.sttStatus === 'processing') {
      // 이미 분석 중이면 중복 업로드 방지
      return {
        recording: {
          id: recording.id,
          sttStatus: recording.sttStatus,
          fileName: recording.fileName,
          fileSize: recording.fileSize,
        },
        consultation: { id: recording.id, content: '[녹음 분석 중...]' },
        sttStatus: 'processing',
        recordingFileName: recording.fileName,
        recordingSize: recording.fileSize,
      };
    }

    // 재분석 대비 기존 메시지 정리
    await this.prisma.callRecordingMessage.deleteMany({
      where: { recordingId: id },
    });

    const updated = await this.prisma.callRecording.update({
      where: { id },
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        sttStatus: 'processing',
        ...(contactId && !recording.contactId ? { contactId } : {}),
      },
    });

    this.callIntelligence.startTranscription(updated.id, file);

    return {
      recording: {
        id: updated.id,
        sttStatus: updated.sttStatus,
        fileName: updated.fileName,
        fileSize: updated.fileSize,
      },
      // 하위 호환: 모바일 폴링이 consultation.id 필드를 recording id로 사용
      consultation: { id: updated.id, content: '[녹음 분석 중...]' },
      sttStatus: 'processing',
      recordingFileName: updated.fileName,
      recordingSize: updated.fileSize,
    };
  }

  /**
   * CallRecording의 STT 상태 + 메시지 조회
   */
  async getSttStatus(id: string, officeId: string) {
    // CallRecording에서 먼저 찾기
    const recording = await this.prisma.callRecording.findFirst({
      where: { id, officeId },
      include: {
        messages: { orderBy: { seq: 'asc' } },
      },
    });

    if (recording) {
      const textContent = recording.messages.length > 0
        ? recording.messages
            .map(m => `${m.speakerLabel || `화자${m.speaker + 1}`}: ${m.text}`)
            .join('\n')
        : '';

      return {
        id: recording.id,
        sttStatus: recording.sttStatus,
        analysisStatus: recording.analysisStatus,
        analysis: recording.analysis,
        content: textContent,
        messages: recording.messages.map(m => ({
          speaker: m.speaker,
          speakerLabel: m.speakerLabel,
          text: m.text,
          startMs: m.startMs,
          endMs: m.endMs,
          seq: m.seq,
        })),
      };
    }

    // 하위 호환: 기존 consultation ID로 조회 시도
    const consultation = await this.prisma.consultation.findFirst({
      where: { id, officeId },
      select: { id: true, content: true },
    });
    if (!consultation) throw new NotFoundException('Recording not found');

    return {
      id: consultation.id,
      sttStatus: consultation.content.startsWith('[녹음 분석 중')
        ? 'processing'
        : 'completed',
      content: consultation.content,
      messages: [],
    };
  }

  /**
   * CallRecording 목록 조회 (서버사이드 필터 + 기간 기준 요약 통계)
   */
  async findRecordings(
    officeId: string,
    query: {
      contactId?: string;
      direction?: string;
      sttStatus?: string;
      dateFrom?: string;
      dateTo?: string;
      q?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const calledAtFilter =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
            ...(query.dateTo && { lte: new Date(query.dateTo) }),
          }
        : undefined;

    const filters: Prisma.CallRecordingWhereInput[] = [{ officeId }];
    if (query.contactId) filters.push({ contactId: query.contactId });
    if (query.direction) filters.push({ direction: query.direction });
    if (query.sttStatus) filters.push({ sttStatus: query.sttStatus });
    if (calledAtFilter) filters.push({ calledAt: calledAtFilter });

    const q = query.q?.trim();
    if (q) {
      const normalized = normalizePhone(q);
      filters.push({
        OR: [
          { contact: { name: { contains: q, mode: 'insensitive' } } },
          { phoneNumber: { contains: q } },
          ...(normalized && normalized !== q
            ? [{ phoneNumber: { contains: normalized } }]
            : []),
          { messages: { some: { text: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    const where: Prisma.CallRecordingWhereInput =
      filters.length === 1 ? filters[0] : { AND: filters };

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    // 요약 통계는 기간 필터만 반영 (방향/상태/검색과 무관 — 대시보드 성격)
    const statsBase: Prisma.CallRecordingWhereInput = {
      officeId,
      ...(calledAtFilter && { calledAt: calledAtFilter }),
    };

    const [items, total, statTotal, statInbound, statOutbound, statMissed, statStt] =
      await Promise.all([
        this.prisma.callRecording.findMany({
          where,
          include: {
            contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
            user: { select: { id: true, name: true } },
            messages: { orderBy: { seq: 'asc' } },
            _count: {
              select: {
                messages: true,
                suggestions: { where: { status: 'pending' } },
              },
            },
          },
          orderBy: { calledAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.callRecording.count({ where }),
        this.prisma.callRecording.count({ where: statsBase }),
        this.prisma.callRecording.count({ where: { ...statsBase, direction: 'inbound' } }),
        this.prisma.callRecording.count({ where: { ...statsBase, direction: 'outbound' } }),
        this.prisma.callRecording.count({
          // 녹음 파일이 있으면 통화한 것 (직접 올린 녹음은 길이를 모를 수 있다)
          where: { ...statsBase, direction: 'inbound', durationSec: { lt: 5 }, fileName: null },
        }),
        this.prisma.callRecording.count({ where: { ...statsBase, sttStatus: 'completed' } }),
      ]);

    return {
      items: items.map(withPrimaryContactPhone),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: {
        total: statTotal,
        inbound: statInbound,
        outbound: statOutbound,
        missed: statMissed,
        sttCompleted: statStt,
      },
    };
  }

  /**
   * CallRecording 1건 상세 (메시지 포함)
   */
  async findRecording(id: string, officeId: string) {
    const recording = await this.prisma.callRecording.findFirst({
      where: { id, officeId },
      include: {
        contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
        user: { select: { id: true, name: true } },
        messages: { orderBy: { seq: 'asc' } },
        consultations: {
          select: { id: true, content: true, type: true, purpose: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        suggestions: {
          orderBy: { seq: 'asc' },
          select: {
            id: true,
            consultationId: true,
            type: true,
            status: true,
            title: true,
            evidence: true,
            payload: true,
            seq: true,
            appliedEntityType: true,
            appliedEntityId: true,
            appliedPayload: true,
            resolvedAt: true,
            resolvedBy: { select: { id: true, name: true } },
            createdAt: true,
          },
        },
      },
    });
    if (!recording) throw new NotFoundException('Recording not found');
    // 제안 카드에 보여줄 대상 이름 (매물·고객 요청·매칭 등)
    const suggestionLabels = await this.callIntelligence.describeSuggestionTargets(
      officeId,
      recording.suggestions.map((suggestion) => suggestion.appliedPayload ?? suggestion.payload),
    );
    return { ...withPrimaryContactPhone(recording), suggestionLabels };
  }

  /**
   * CallRecording 갱신 — 미등록 번호 연락처 연결, 화자 라벨(나/고객) 수정
   */
  async updateRecording(
    id: string,
    officeId: string,
    dto: {
      contactId?: string | null;
      speakerLabels?: Array<{ speaker: number; label: string }>;
    },
  ) {
    const recording = await this.prisma.callRecording.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!recording) throw new NotFoundException('Recording not found');

    if (dto.contactId !== undefined) {
      if (dto.contactId) {
        const contact = await this.prisma.contact.findFirst({
          where: { id: dto.contactId, officeId },
          select: { id: true },
        });
        if (!contact) throw new NotFoundException('Contact not found');
      }
      const before = await this.prisma.callRecording.findUnique({
        where: { id },
        select: { contactId: true, sttStatus: true },
      });
      const contactChanged = !!before && before.contactId !== dto.contactId;
      await this.prisma.$transaction([
        this.prisma.callRecording.update({
          where: { id },
          data: { contactId: dto.contactId },
        }),
        // 이전 통화 상대 기준으로 만든 처리 전 제안은 바로 없앤다 (다시 분석이 실패해도 남지 않게)
        ...(contactChanged
          ? [
              this.prisma.callActionSuggestion.deleteMany({
                where: { recordingId: id, status: 'pending' },
              }),
            ]
          : []),
      ]);
      // 연락처가 바뀌면 그 사람의 매물·구매 요청을 보고 다시 분석한다 (상담 기록도 이때 생긴다)
      if (contactChanged && before.sttStatus === 'completed') {
        await this.callIntelligence
          .requestReanalysis(id, officeId)
          .catch((error: unknown) =>
            this.logger.warn(
              `Reanalysis after contact link skipped for ${id}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }
    }

    if (dto.speakerLabels?.length) {
      await Promise.all(
        dto.speakerLabels.map((entry) =>
          this.prisma.callRecordingMessage.updateMany({
            where: { recordingId: id, speaker: entry.speaker },
            data: { speakerLabel: entry.label },
          }),
        ),
      );
    }

    return this.findRecording(id, officeId);
  }

  /**
   * 녹음 없이 통화 기록만 생성 (통화 종료 시 앱에서 자동 전송)
   */
  async createRecordingLog(
    officeId: string,
    userId: string,
    dto: {
      direction: string;
      phoneNumber: string;
      durationSec?: number;
      contactId?: string;
      result?: string;
    },
  ) {
    // 전화번호로 연락처 자동 매칭
    let contactId = dto.contactId || null;
    if (!contactId && dto.phoneNumber) {
      const contact = await this.prisma.contact.findFirst({
        where: {
          officeId,
          phones: { some: { phone: normalizePhone(dto.phoneNumber) } },
        },
        select: { id: true },
      });
      contactId = contact?.id || null;
    }

    const recording = await this.prisma.callRecording.create({
      data: {
        officeId,
        userId,
        contactId,
        direction: dto.direction || 'inbound',
        phoneNumber: dto.phoneNumber || '',
        durationSec: dto.durationSec || 0,
        sttStatus: 'none',
        calledAt: new Date(),
      },
      include: {
        contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
      },
    });

    return withPrimaryContactPhone(recording);
  }

  /** 받아쓰기는 두고 분석만 다시 한다 */
  reanalyzeRecording(id: string, officeId: string) {
    return this.callIntelligence.requestReanalysis(id, officeId);
  }
}

function parseOptionalDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
