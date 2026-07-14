import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { formatKoreanPhone, normalizeCtiPhone } from './cti-phone.util';
import {
  CtiLineCredential,
  decryptCtiCredential,
  encryptCtiCredential,
} from './cti-line-credential.util';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const LOOKUP_RECENT_LIMIT = 5;

// ================================================================
// DTO 타입 (브리지 게이트웨이 + REST 공용)
// ================================================================

export interface IncomingCallDto {
  providerCode: string;
  /// 프로바이더가 준 원본 CID (브리지 1차 정규화 후에도 서버가 2차 정규화)
  rawCid: string;
  /// 착신 수신 번호 (어느 회선으로 걸려왔는지, 레거시 Tel_No)
  recvNo?: string;
  /// dedup/idempotency 키 (레거시 sKTPreChannel/sLGUPreChannel 대응)
  channelKey?: string;
  occurredAt?: string;
}

export interface CallEndedDto {
  channelKey: string;
  endedAt?: string;
  /// answered(수신완료) / missed(부재) — 레거시 Rcpt_Stat 대응
  disposition?: 'answered' | 'missed';
}

export interface DialResultDto {
  requestId: string;
  success: boolean;
  message?: string;
}

export interface ListCallsFilter {
  page?: number;
  limit?: number;
  direction?: string;
  status?: string;
  phone?: string;
  contactId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface UpsertCtiLineDto {
  providerCode: string;
  displayName: string;
  externalId?: string;
  internalNo?: string;
  /// 쓰기 전용 — 저장 시 암호화, 응답에 절대 미포함
  credential?: CtiLineCredential;
  isMasterOnly?: boolean;
  isDelegate?: boolean;
  isActive?: boolean;
}

@Injectable()
export class CtiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // ================================================================
  // 착신/통화 이벤트 (브리지 → 게이트웨이 → 여기)
  // ================================================================

  /**
   * 착신 이벤트 INSERT + lookup + 사무소 브로드캐스트.
   * 레거시 MCLS002I01 + SendManagerUs("MC:...") 릴레이의 통합 대체.
   * channelKey 기준 idempotent — 같은 착신이 중복 보고돼도 1건만 남는다.
   */
  async recordIncoming(officeId: string, dto: IncomingCallDto) {
    const { phoneNumber, isPrivate } = normalizeCtiPhone(dto.rawCid);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const data = {
      officeId,
      direction: 'inbound',
      phoneNumber,
      isPrivate,
      receivedNo: dto.recvNo ?? null,
      providerCode: dto.providerCode,
      channelKey: dto.channelKey ?? null,
      status: 'ringing',
      occurredAt,
    };

    const callEvent = dto.channelKey
      ? await this.prisma.callEvent.upsert({
          where: {
            officeId_channelKey: { officeId, channelKey: dto.channelKey },
          },
          create: data,
          // 중복 보고는 최초 레코드 유지 (사용자 확정 데이터 보존 원칙)
          update: {},
        })
      : await this.prisma.callEvent.create({ data });

    const lookup = isPrivate ? null : await this.lookup(officeId, phoneNumber);

    this.realtime.emitCallIncoming({
      officeId,
      callEventId: callEvent.id,
      phoneNumber,
      isPrivate,
      providerCode: dto.providerCode,
      receivedNo: dto.recvNo ?? null,
      occurredAt: occurredAt.toISOString(),
      lookup,
    });

    return { callEvent, lookup };
  }

  /** 레거시 m_MyCallBack(MCDS001U01) 대체 — 통화 응답/종료 상태 갱신 */
  async markAnswered(officeId: string, channelKey: string) {
    const updated = await this.prisma.callEvent.updateMany({
      where: { officeId, channelKey, deletedAt: null },
      data: { status: 'answered' },
    });
    if (updated.count > 0) {
      const callEvent = await this.findByChannelKey(officeId, channelKey);
      if (callEvent) {
        this.realtime.emitCallUpdated({
          officeId,
          callEventId: callEvent.id,
          status: 'answered',
        });
      }
    }
  }

  async markEnded(officeId: string, dto: CallEndedDto) {
    const callEvent = await this.findByChannelKey(officeId, dto.channelKey);
    if (!callEvent) return;

    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    // ringing 상태에서 바로 끝나면 부재(missed), 응답 후 종료면 ended
    const status =
      dto.disposition === 'missed' ||
      (dto.disposition === undefined && callEvent.status === 'ringing')
        ? 'missed'
        : 'ended';

    await this.prisma.callEvent.update({
      where: { id: callEvent.id },
      data: { status, endedAt },
    });

    this.realtime.emitCallUpdated({
      officeId,
      callEventId: callEvent.id,
      status,
      endedAt: endedAt.toISOString(),
    });
  }

  /**
   * 발신 요청 (레거시 FC 위임 → 서버 경유로 승격).
   * CallEvent(outbound, dialing)를 먼저 만들고, 그 id를 requestId로
   * 브리지에 위임한다. 회선 자격증명은 여기서 복호화해 게이트웨이가
   * WSS로 일회성 전달 — DB/응답에는 남지 않는다.
   */
  async createDialRequest(
    officeId: string,
    userId: string,
    dto: { phoneNumber: string; lineId?: string },
  ) {
    const { phoneNumber, isPrivate } = normalizeCtiPhone(dto.phoneNumber);
    if (isPrivate || !phoneNumber) {
      throw new BadRequestException('발신할 전화번호가 올바르지 않습니다.');
    }

    const line = dto.lineId
      ? await this.prisma.ctiLine.findFirst({
          where: { id: dto.lineId, officeId, isActive: true },
        })
      : await this.prisma.ctiLine.findFirst({
          where: { officeId, isActive: true },
          orderBy: [{ isDelegate: 'desc' }, { createdAt: 'asc' }],
        });

    if (!line) {
      throw new BadRequestException(
        '사용 가능한 전화 회선이 없습니다. CTI 회선을 먼저 등록하세요.',
      );
    }

    const callEvent = await this.prisma.callEvent.create({
      data: {
        officeId,
        direction: 'outbound',
        phoneNumber,
        providerCode: line.providerCode,
        status: 'dialing',
        userId,
        occurredAt: new Date(),
      },
    });

    return {
      callEvent,
      line,
      credential: line.credentialCipher
        ? decryptCtiCredential(line.credentialCipher)
        : null,
    };
  }

  /** 레거시 m_MyCallDialResult(MCLS002I04 성공 기록) 대체 */
  async recordDialResult(officeId: string, dto: DialResultDto) {
    const callEvent = await this.prisma.callEvent.findFirst({
      where: { id: dto.requestId, officeId, direction: 'outbound' },
    });
    if (!callEvent) return;

    await this.prisma.callEvent.update({
      where: { id: callEvent.id },
      data: { status: dto.success ? 'dialed' : 'dial_failed' },
    });

    this.realtime.emitCallDialResult({
      officeId,
      callEventId: callEvent.id,
      success: dto.success,
      message: dto.message ?? null,
    });
  }

  // ================================================================
  // 통화 이력 REST (레거시 MCLS001Q01 / MCDS001U01 / MCDS001U02 / MCDS001D01)
  // ================================================================

  async listCalls(officeId: string, filter: ListCallsFilter) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, filter.limit ?? DEFAULT_PAGE_LIMIT));

    const where = {
      officeId,
      deletedAt: null,
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.contactId ? { contactId: filter.contactId } : {}),
      ...(filter.phone
        ? { phoneNumber: { contains: filter.phone.replace(/\D/g, '') } }
        : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            occurredAt: {
              ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
              ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.callEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contact: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.callEvent.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateCall(
    officeId: string,
    id: string,
    dto: { status?: string; endedAt?: string; userId?: string },
  ) {
    await this.ensureCallExists(officeId, id);
    const callEvent = await this.prisma.callEvent.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.endedAt ? { endedAt: new Date(dto.endedAt) } : {}),
        ...(dto.userId ? { userId: dto.userId } : {}),
      },
    });

    this.realtime.emitCallUpdated({
      officeId,
      callEventId: callEvent.id,
      status: callEvent.status,
      endedAt: callEvent.endedAt?.toISOString() ?? null,
    });

    return callEvent;
  }

  /**
   * 명시적 [이 고객으로 연결] — 레거시 MCDS001U02(팝업 닫힘 시 무조건 저장)의
   * 부작용을 제거한 대체. 버튼 클릭에서만 호출되며, ActivityLog에 기록한다
   * (CTI 이벤트 자체는 감사 로그 제외, 고객 연결 확정만 로깅).
   */
  async linkContact(
    officeId: string,
    userId: string,
    id: string,
    contactId: string | null,
  ) {
    const existing = await this.ensureCallExists(officeId, id);

    if (contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId, officeId },
        select: { id: true },
      });
      if (!contact) {
        throw new NotFoundException('연락처를 찾을 수 없습니다.');
      }
    }

    const callEvent = await this.prisma.callEvent.update({
      where: { id },
      data: { contactId },
    });

    await this.prisma.activityLog.create({
      data: {
        officeId,
        userId,
        actor: 'user',
        source: 'web',
        action: 'update',
        entityType: 'CallEvent',
        entityId: id,
        changes: {
          contactId: { before: existing.contactId, after: contactId },
        },
      },
    });

    return callEvent;
  }

  async softDeleteCall(officeId: string, id: string) {
    await this.ensureCallExists(officeId, id);
    await this.prisma.callEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ================================================================
  // 통합 조회 (레거시 frmMyCall.doSearch / MCLS002Q01 — 4그리드 대체)
  // ================================================================

  /**
   * 착신 번호로 고객(Contact) / 업체(VendorContact) / 공동중개 파트너(PartnerBroker) /
   * 최근 통화 / 최근 상담을 한 번에 조회. 착신 팝업의 단일 데이터 소스.
   */
  async lookup(officeId: string, phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      throw new BadRequestException('조회할 전화번호가 필요합니다.');
    }
    const candidates = [digits, formatKoreanPhone(digits)];

    const [contactPhones, vendorContacts, partnerBrokers, recentCalls] =
      await Promise.all([
        this.prisma.contactPhone.findMany({
          where: { officeId, normalizedPhone: digits, isActive: true },
          include: {
            contact: {
              select: { id: true, name: true, tags: true, memo: true },
            },
          },
        }),
        this.prisma.vendorContact.findMany({
          where: {
            phone: { in: candidates },
            vendor: {
              isActive: true,
              OR: [{ officeId }, { officeId: null }],
            },
          },
          include: {
            vendor: { select: { id: true, name: true, officeId: true } },
          },
        }),
        this.prisma.partnerBroker.findMany({
          where: {
            officeId,
            OR: [
              { phone: { in: candidates } },
              { ceoPhone: { in: candidates } },
            ],
          },
          select: { id: true, name: true, ceoName: true, phone: true },
        }),
        this.prisma.callEvent.findMany({
          where: { officeId, phoneNumber: digits, deletedAt: null },
          orderBy: { occurredAt: 'desc' },
          take: LOOKUP_RECENT_LIMIT,
          select: {
            id: true,
            direction: true,
            status: true,
            occurredAt: true,
            contactId: true,
          },
        }),
      ]);

    const contactIds = contactPhones.map((p) => p.contactId);
    const recentConsultations = contactIds.length
      ? await this.prisma.consultation.findMany({
          where: { officeId, contactId: { in: contactIds } },
          orderBy: { createdAt: 'desc' },
          take: LOOKUP_RECENT_LIMIT,
          select: {
            id: true,
            contactId: true,
            type: true,
            content: true,
            createdAt: true,
          },
        })
      : [];

    return {
      phoneNumber: digits,
      contacts: contactPhones.map((p) => ({
        id: p.contact.id,
        name: p.contact.name,
        tags: p.contact.tags,
        memo: p.contact.memo,
        phoneLabel: p.label,
        isPrimary: p.isPrimary,
      })),
      vendors: vendorContacts.map((vc) => ({
        vendorId: vc.vendor.id,
        vendorName: vc.vendor.name,
        isSharedPool: vc.vendor.officeId === null,
        contactName: vc.name,
        role: vc.role,
      })),
      partnerBrokers,
      recentCalls,
      recentConsultations,
    };
  }

  // ================================================================
  // 회선 관리 (레거시 MCDS004Q01 / CIDS* 회선 CRUD)
  // ================================================================

  async listLines(officeId: string) {
    const lines = await this.prisma.ctiLine.findMany({
      where: { officeId },
      orderBy: [{ isDelegate: 'desc' }, { createdAt: 'asc' }],
    });
    // credentialCipher는 절대 응답에 포함하지 않는다
    return lines.map(({ credentialCipher, ...line }) => ({
      ...line,
      hasCredential: !!credentialCipher,
    }));
  }

  async createLine(officeId: string, dto: UpsertCtiLineDto) {
    const line = await this.prisma.ctiLine.create({
      data: {
        officeId,
        providerCode: dto.providerCode,
        displayName: dto.displayName,
        externalId: dto.externalId ?? null,
        internalNo: dto.internalNo ?? null,
        credentialCipher: dto.credential
          ? encryptCtiCredential(dto.credential)
          : null,
        isMasterOnly: dto.isMasterOnly ?? false,
        isDelegate: dto.isDelegate ?? false,
        isActive: dto.isActive ?? true,
      },
    });
    const { credentialCipher, ...safe } = line;
    return { ...safe, hasCredential: !!credentialCipher };
  }

  async updateLine(officeId: string, id: string, dto: Partial<UpsertCtiLineDto>) {
    const existing = await this.prisma.ctiLine.findFirst({
      where: { id, officeId },
    });
    if (!existing) throw new NotFoundException('회선을 찾을 수 없습니다.');

    const line = await this.prisma.ctiLine.update({
      where: { id },
      data: {
        ...(dto.providerCode !== undefined ? { providerCode: dto.providerCode } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.externalId !== undefined ? { externalId: dto.externalId } : {}),
        ...(dto.internalNo !== undefined ? { internalNo: dto.internalNo } : {}),
        ...(dto.credential !== undefined
          ? {
              credentialCipher: dto.credential
                ? encryptCtiCredential(dto.credential)
                : null,
            }
          : {}),
        ...(dto.isMasterOnly !== undefined ? { isMasterOnly: dto.isMasterOnly } : {}),
        ...(dto.isDelegate !== undefined ? { isDelegate: dto.isDelegate } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    const { credentialCipher, ...safe } = line;
    return { ...safe, hasCredential: !!credentialCipher };
  }

  async deleteLine(officeId: string, id: string) {
    const existing = await this.prisma.ctiLine.findFirst({
      where: { id, officeId },
    });
    if (!existing) throw new NotFoundException('회선을 찾을 수 없습니다.');
    await this.prisma.ctiLine.delete({ where: { id } });
  }

  /**
   * 브리지 접속 시 내려줄 회선 설정.
   *
   * 자격증명은 원칙적으로 발신 위임 시에만 일회성 전달하지만,
   * CID 수신을 위해 프로바이더 로그인이 필요한 회선(KT 41 / 삼성 50 / LGU 70,
   * 레거시 KTPLogin·ActiveX 로그인 대응)은 접속 시점에 함께 내려준다.
   * WSS(TLS) + ctib_ 인증 채널로만 전달되고 브리지는 메모리에만 보관 —
   * 레거시처럼 디스크/DataTable에 상주시키지 않는다.
   */
  async getBridgeLineConfigs(officeId: string) {
    const lines = await this.prisma.ctiLine.findMany({
      where: { officeId, isActive: true },
    });
    const LOGIN_REQUIRED_PROVIDERS = new Set(['41', '50', '70']);
    return lines.map((line) => ({
      id: line.id,
      providerCode: line.providerCode,
      displayName: line.displayName,
      externalId: line.externalId,
      internalNo: line.internalNo,
      isMasterOnly: line.isMasterOnly,
      isDelegate: line.isDelegate,
      credential:
        LOGIN_REQUIRED_PROVIDERS.has(line.providerCode) && line.credentialCipher
          ? decryptCtiCredential(line.credentialCipher)
          : null,
    }));
  }

  // ================================================================
  // 내부 헬퍼
  // ================================================================

  private async findByChannelKey(officeId: string, channelKey: string) {
    return this.prisma.callEvent.findFirst({
      where: { officeId, channelKey, deletedAt: null },
    });
  }

  private async ensureCallExists(officeId: string, id: string) {
    const callEvent = await this.prisma.callEvent.findFirst({
      where: { id, officeId, deletedAt: null },
    });
    if (!callEvent) {
      throw new NotFoundException('통화 이력을 찾을 수 없습니다.');
    }
    return callEvent;
  }
}
