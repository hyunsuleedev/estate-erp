import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesSelectOrdered,
  normalizePhone,
  phoneSearchDigits,
  withPrimaryContactPhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import { LISTING_INTAKE_STATE_SELECT } from '../listings/listing-state';
import { parseCallRecordingFileName } from '@estate-erp/shared';
import { CallIntelligenceService } from '../call-intelligence/call-intelligence.service';
import { assertLinksInOffice, isUuid, type LinkField } from '../tasks/linked-records';

export interface ConsultationSearchQuery {
  q?: string;
  contactId?: string;
  scope?: 'self' | 'party';
  propertyId?: string;
  siteId?: string;
  dongId?: string;
  unitId?: string;
  listingIntakeId?: string;
  buyerIntakeId?: string;
  dealId?: string;
  projectId?: string;
  context?:
    | 'property'
    | 'listingIntake'
    | 'buyerIntake'
    | 'deal'
    | 'project'
    | 'unlinked';
  outcome?: 'actionRequired' | 'confirmed' | 'held';
  type?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  /** with = 녹음이 붙은 상담만, without = 녹음 없는 상담만 */
  recording?: 'with' | 'without';
  /** pending = 통화 분석이 낸 제안 가운데 아직 처리하지 않은 것이 있는 상담만 (작업 요청) */
  suggestions?: 'pending';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * 상담 목록에 붙여 보내는 녹음 요약. 받아쓰기 전문과 분석 전체는 녹음 상세에서 따로 읽는다
 * (목록 한 줄마다 대화 전체를 실어 보내지 않기 위해서다).
 */
const CONSULTATION_RECORDING_SELECT = {
  id: true,
  direction: true,
  durationSec: true,
  fileName: true,
  sttStatus: true,
  analysisStatus: true,
  analysis: true,
  autoConsultationId: true,
  _count: { select: { suggestions: { where: { status: 'pending' } } } },
} satisfies Prisma.CallRecordingSelect;

type ConsultationRecordingRow = Prisma.CallRecordingGetPayload<{
  select: typeof CONSULTATION_RECORDING_SELECT;
}>;

/** 상담이 가리킬 수 있는 연결 칸. 모두 같은 사무소의 것이어야 한다 (업무·일정과 같은 검사) */
const CONSULTATION_LINK_FIELDS: LinkField[] = [
  { key: 'propertyId', model: 'property', object: '매물을' },
  { key: 'listingIntakeId', model: 'listingIntake', object: '매물 의뢰를' },
  { key: 'buyerIntakeId', model: 'buyerIntake', object: '구매 의뢰를' },
  { key: 'dealId', model: 'deal', object: '거래를' },
  { key: 'projectId', model: 'project', object: '프로젝트를' },
  { key: 'callRecordingId', model: 'callRecording', object: '통화 녹음을' },
];

/** 상담 방식. 화면의 "전화 · 방문 · 문자·온라인"과 같다. */
const CONSULTATION_TYPES = ['phone', 'visit', 'online'];
/** 컴퓨터 시계가 조금 빠른 경우까지는 "지금"으로 받는다 */
const CONSULTED_AT_FUTURE_SLACK_MS = 10 * 60 * 1000;

function requireConsultationType(type: unknown): string {
  if (typeof type !== 'string' || !CONSULTATION_TYPES.includes(type)) {
    throw new BadRequestException('상담 방식은 전화 · 방문 · 문자·온라인 가운데 하나를 고르세요.');
  }
  return type;
}

function requireConsultationContent(content: unknown): string {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) throw new BadRequestException('상담 내용을 입력하세요.');
  return trimmed;
}

/**
 * 상담한 때. 비우면 지금이다. 지난 일을 나중에 적을 수 있게 과거는 받고, 앞날은 받지 않는다.
 * 상담 목록과 화면의 일시는 모두 createdAt을 읽으므로 이 값을 createdAt에 넣는다.
 */
function parseConsultedAt(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('상담 일시를 알아볼 수 없습니다.');
  }
  if (date.getTime() > Date.now() + CONSULTED_AT_FUTURE_SLACK_MS) {
    throw new BadRequestException('앞으로의 날짜로는 상담을 적을 수 없습니다. 약속은 업무나 일정으로 남기세요.');
  }
  return date;
}

function summarizeRecording(
  recording: ConsultationRecordingRow | null,
  consultation: { id?: string; content?: string | null },
) {
  if (!recording) return null;
  const analysis = recording.analysis as {
    summary?: unknown;
    consultationContent?: unknown;
  } | null;
  return {
    id: recording.id,
    direction: recording.direction,
    durationSec: recording.durationSec,
    hasFile: Boolean(recording.fileName),
    sttStatus: recording.sttStatus,
    analysisStatus: recording.analysisStatus,
    summary: typeof analysis?.summary === 'string' ? analysis.summary : null,
    pendingSuggestionCount: recording._count.suggestions,
    // 상담 내용이 분석이 써 넣은 글 그대로인지. 사람이 한 글자라도 고쳤거나 직접 적은 상담이면 false다.
    // 화면은 이 값이 true일 때만 내용을 "AI가 쓴 글"로 다룬다 (추측으로 사람의 메모를 가리지 않게).
    contentIsAuto:
      recording.autoConsultationId === consultation.id &&
      typeof analysis?.consultationContent === 'string' &&
      analysis.consultationContent === consultation.content,
  };
}

/** 응답 모양으로: 대표 전화번호를 붙이고 녹음은 요약만 남긴다 */
function toConsultationResponse<
  T extends Parameters<typeof withPrimaryContactPhone>[0] & {
    id?: string;
    content?: string | null;
    callRecording?: ConsultationRecordingRow | null;
  },
>(row: T) {
  const { callRecording, ...rest } = withPrimaryContactPhone(row);
  return { ...rest, callRecording: summarizeRecording(callRecording ?? null, row) };
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
            name: true, floorEnd: true, floorLabel: true,
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
    buyerIntake: {
      select: { id: true, lifecycleStatus: true, receivedAt: true },
    },
    deal: {
      select: {
        id: true,
        stage: true,
        transactionType: true,
        isCancelled: true,
      },
    },
    project: {
      select: {
        id: true,
        title: true,
      },
    },
    createdBy: { select: { id: true, name: true } },
    callRecording: { select: CONSULTATION_RECORDING_SELECT },
  };

  async findAll(officeId: string, query: ConsultationSearchQuery = {}) {
    const filters: Prisma.ConsultationWhereInput[] = [{ officeId }];

    if (query.contactId) {
      if (query.scope === 'party') {
        const contactIds = await this.expandPartyContactIds(officeId, query.contactId);
        filters.push({ contactId: { in: contactIds } });
      } else {
        filters.push({ contactId: query.contactId });
      }
    }
    if (query.propertyId) filters.push({ propertyId: query.propertyId });
    if (query.siteId) filters.push({ property: { siteId: query.siteId } });
    if (query.dongId) filters.push({ property: { unit: { dongId: query.dongId } } });
    if (query.unitId) filters.push({ property: { unitId: query.unitId } });
    if (query.listingIntakeId) filters.push({ listingIntakeId: query.listingIntakeId });
    if (query.buyerIntakeId) {
      filters.push({ buyerIntakeId: query.buyerIntakeId });
    }
    if (query.dealId) filters.push({ dealId: query.dealId });
    if (query.projectId) filters.push({ projectId: query.projectId });
    if (query.type) filters.push({ type: query.type });
    if (query.createdById) filters.push({ createdById: query.createdById });
    if (query.recording === 'with') filters.push({ callRecordingId: { not: null } });
    if (query.recording === 'without') filters.push({ callRecordingId: null });
    if (query.suggestions === 'pending') {
      filters.push({ callRecording: { suggestions: { some: { status: 'pending' } } } });
    }

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
      // 글자가 섞인 검색어("그라시움 101동")의 숫자로 전화번호를 찾지 않는다
      const canonicalPhone = phoneSearchDigits(q);
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
      items: items.map(toConsultationResponse),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async expandPartyContactIds(officeId: string, contactId: string): Promise<string[]> {
    const ids = new Set<string>([contactId]);
    const [memberships, orgParty] = await Promise.all([
      this.prisma.partyMember.findMany({
        where: { officeId, contactId, status: 'active' },
        select: { partyId: true },
      }),
      this.prisma.party.findFirst({
        where: { officeId, kind: 'organization', organizationContactId: contactId },
        select: { id: true },
      }),
    ]);
    const partyIds = Array.from(
      new Set([
        ...memberships.map((item) => item.partyId),
        ...(orgParty ? [orgParty.id] : []),
      ]),
    );
    if (partyIds.length === 0) return Array.from(ids);
    const [parties, members] = await Promise.all([
      this.prisma.party.findMany({
        where: { officeId, id: { in: partyIds }, organizationContactId: { not: null } },
        select: { organizationContactId: true },
      }),
      this.prisma.partyMember.findMany({
        where: { officeId, partyId: { in: partyIds }, status: 'active' },
        select: { contactId: true },
      }),
    ]);
    for (const party of parties) {
      if (party.organizationContactId) ids.add(party.organizationContactId);
    }
    for (const member of members) {
      ids.add(member.contactId);
    }
    return Array.from(ids);
  }

  private buildContextFilter(context: NonNullable<ConsultationSearchQuery['context']>): Prisma.ConsultationWhereInput {
    if (context === 'property') return { propertyId: { not: null } };
    if (context === 'listingIntake') return { listingIntakeId: { not: null } };
    if (context === 'buyerIntake') return { buyerIntakeId: { not: null } };
    if (context === 'deal') return { dealId: { not: null } };
    if (context === 'project') return { projectId: { not: null } };
    return {
      propertyId: null,
      listingIntakeId: null,
      buyerIntakeId: null,
      dealId: null,
      projectId: null,
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
    if (!consultation) throw new NotFoundException('상담 기록을 찾을 수 없습니다.');
    return toConsultationResponse(consultation);
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
      buyerIntakeId?: string;
      dealId?: string;
      projectId?: string;
      /** 통화 녹음 연결 (통화 → 상담 전환) */
      callRecordingId?: string;
      /** 상담한 때. 비우면 지금 */
      consultedAt?: string;
    },
  ) {
    const {
      propertyId,
      listingIntakeId,
      buyerIntakeId,
      dealId,
      projectId,
      callRecordingId,
      consultedAt,
      contactId,
      purpose,
    } = dto;
    if (typeof contactId !== 'string' || !contactId) {
      throw new BadRequestException('상담한 고객을 고르세요.');
    }
    const type = requireConsultationType(dto.type);
    const content = requireConsultationContent(dto.content);
    const createdAt = parseConsultedAt(consultedAt);

    if (!isUuid(contactId)) throw new NotFoundException('연락처를 찾을 수 없습니다.');
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, officeId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');

    // 연결 칸(매물 · 의뢰 · 구매 의뢰 · 거래 · 프로젝트 · 녹음)이 이 사무소의 것인지 저장 전에 확인한다.
    // 이 칸들의 FK는 id만 가리켜 DB가 다른 사무소의 행을 막지 못하고, 막지 않으면 응답(include)에
    // 남의 사무소 단지 이름 · 의뢰 상태가 실린다.
    await assertLinksInOffice(this.prisma, officeId, dto, CONSULTATION_LINK_FIELDS);

    let resolvedPropertyId = propertyId || undefined;
    if (listingIntakeId) {
      const listingIntake = await this.prisma.listingIntake.findFirst({
        where: { id: listingIntakeId, officeId },
        select: { id: true, propertyId: true },
      });
      if (!listingIntake) {
        throw new NotFoundException('매물 의뢰를 찾을 수 없습니다.');
      }
      if (resolvedPropertyId && resolvedPropertyId !== listingIntake.propertyId) {
        throw new BadRequestException('고른 의뢰가 고른 매물에 속해 있지 않습니다.');
      }
      resolvedPropertyId = listingIntake.propertyId;
    }

    const resolvedBuyerIntakeId = buyerIntakeId || undefined;
    if (resolvedBuyerIntakeId) {
      const intake = await this.prisma.buyerIntake.findFirst({
        where: { id: resolvedBuyerIntakeId, officeId },
        select: { id: true },
      });
      if (!intake) throw new NotFoundException('구매 의뢰를 찾을 수 없습니다.');
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
          '이 고객은 고른 구매 의뢰의 고객이 아닙니다. 구매 의뢰에 고객을 먼저 넣어 주세요.',
        );
      }
    }

    // 통화 녹음 연결 시 같은 사무소 소유인지 확인
    if (callRecordingId) {
      const recording = await this.prisma.callRecording.findFirst({
        where: { id: callRecordingId, officeId },
        select: { id: true },
      });
      if (!recording) throw new NotFoundException('통화 녹음을 찾을 수 없습니다.');
    }

    const created = await this.prisma.consultation.create({
      data: {
        officeId,
        createdById: userId,
        contactId,
        type,
        content,
        ...(purpose ? { purpose } : {}),
        ...(createdAt ? { createdAt } : {}),
        propertyId: resolvedPropertyId,
        listingIntakeId: listingIntakeId || undefined,
        buyerIntakeId: resolvedBuyerIntakeId,
        dealId: dealId || undefined,
        projectId: projectId || undefined,
        callRecordingId: callRecordingId || undefined,
      },
      include: this.defaultInclude,
    });

    // 이 사람과 나눈 상담은 그 사람이 손님인 진행 중 희망 조건의 "최근 연락"이기도 하다.
    // 예전에는 희망 조건 화면에서 적은 상담만 반영돼, 연락처에서 상담을 적으면 희망 조건에는 "최근 연락 없음"으로 남았다.
    // 더 최근 값은 덮지 않는다(한 문장으로 비교해 쓴다). 상담은 이미 저장됐으므로 여기서 실패해도 요청은 성공으로 둔다.
    const contactedAt = created.createdAt;
    await this.prisma.buyerRequirement
      .updateMany({
        where: {
          officeId,
          status: { not: 'completed' },
          buyerIntake: { contacts: { some: { contactId } } },
          OR: [{ lastContactDate: null }, { lastContactDate: { lt: contactedAt } }],
        },
        data: { lastContactDate: contactedAt },
      })
      .catch(() => undefined);

    return toConsultationResponse(created);
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      type?: string;
      content?: string;
      /** 상담한 때를 고친다 (지난 일만) */
      consultedAt?: string;
    },
  ) {
    await this.findOne(id, officeId);
    const createdAt = parseConsultedAt(dto.consultedAt);
    return this.prisma.consultation.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: requireConsultationType(dto.type) }),
        ...(dto.content !== undefined && { content: requireConsultationContent(dto.content) }),
        ...(createdAt && { createdAt }),
      },
      include: this.defaultInclude,
    }).then(toConsultationResponse);
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
    return consultations.map(toConsultationResponse);
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
        // 방문 상담 녹음은 통화가 아니므로 수신·발신 대신 visit으로 둔다 (자동 상담 기록도 방문 상담이 된다)
        direction: recordingDirection(dto.type, dto.direction),
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

  /**
   * 이미 적어 둔 상담(방문 메모 등)에 녹음을 붙인다 → 받아쓰기·분석(비동기).
   * 녹음의 자동 상담 자리를 이 상담으로 잡아 두므로 분석이 상담을 새로 만들지 않고,
   * 사람이 적은 내용도 덮어쓰지 않는다(분석은 자기가 쓴 글만 고친다). 요약과 업무 제안은 녹음 쪽에 남는다.
   */
  async attachRecordingToConsultation(
    id: string,
    officeId: string,
    userId: string,
    dto: { durationSec?: number; calledAt?: string; direction?: string },
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('녹음 파일이 필요합니다');

    const recording = await this.prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.findFirst({
        where: { id, officeId },
        select: {
          id: true,
          type: true,
          contactId: true,
          createdAt: true,
          contact: { select: { phones: contactPhonesSelectOrdered } },
        },
      });
      if (!consultation) throw new NotFoundException('상담 기록을 찾을 수 없습니다.');

      const created = await tx.callRecording.create({
        data: {
          officeId,
          userId,
          contactId: consultation.contactId,
          direction: recordingDirection(consultation.type, dto.direction),
          phoneNumber: withPrimaryPhone(consultation.contact).phone ?? '',
          durationSec: dto.durationSec || 0,
          fileName: file.originalname,
          fileSize: file.size,
          sttStatus: 'processing',
          // 상담한 시각에 놓는다. 따로 알려 주지 않으면 상담 기록의 시각을 쓴다.
          calledAt: parseOptionalDate(dto.calledAt) ?? consultation.createdAt,
          autoConsultationId: consultation.id,
        },
      });
      // 두 사람이 동시에 붙여도 녹음 하나만 남도록, 비어 있을 때만 연결한다
      const linked = await tx.consultation.updateMany({
        where: { id: consultation.id, officeId, callRecordingId: null },
        data: { callRecordingId: created.id },
      });
      if (linked.count === 0) {
        throw new ConflictException('이미 녹음이 붙어 있는 상담입니다');
      }
      return created;
    });

    this.callIntelligence.startTranscription(recording.id, file);

    return {
      recording: {
        id: recording.id,
        sttStatus: recording.sttStatus,
        fileName: recording.fileName,
        fileSize: recording.fileSize,
      },
      consultation: { id },
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
      if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');
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
    if (!recording) throw new NotFoundException('통화 녹음을 찾을 수 없습니다.');
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
    if (!consultation) throw new NotFoundException('통화 녹음을 찾을 수 없습니다.');

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
      /** 녹음은 있는데 아직 상담 기록이 없는 것만 (미등록 번호, 받아쓰기·분석 중, 실패) */
      unlinked?: boolean;
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
    if (query.unlinked) filters.push({ fileName: { not: null }, consultations: { none: {} } });

    const q = query.q?.trim();
    if (q) {
      const normalized = phoneSearchDigits(q);
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
    if (!recording) throw new NotFoundException('통화 녹음을 찾을 수 없습니다.');
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
    if (!recording) throw new NotFoundException('통화 녹음을 찾을 수 없습니다.');

    if (dto.contactId !== undefined) {
      if (dto.contactId) {
        const contact = await this.prisma.contact.findFirst({
          where: { id: dto.contactId, officeId },
          select: { id: true },
        });
        if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');
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

/** 녹음 방향: 방문 상담이면 visit, 아니면 수신·발신 */
export function recordingDirection(type: string | undefined, direction: string | undefined) {
  if (type === 'visit') return 'visit';
  return direction === 'outbound' ? 'outbound' : 'inbound';
}
