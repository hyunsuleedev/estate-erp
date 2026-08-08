import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { normalizePhone } from '../contacts/contact-phone.utils';
import { CallEventDto, UpdateCallLogDto } from './dto/cti.dto';

export interface CallLogListQuery {
  direction?: string;
  status?: string;
  phone?: string;
  contactId?: string;
  page?: number;
  limit?: number;
}

/** terminate 이벤트가 seqno 없이 왔을 때 최근 통화를 찾는 시간 창 */
const TERMINATE_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
/** 이미 종료된 로그를 terminate 중복 보고로 간주하는 endedAt 근접 창 */
const TERMINATE_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class CtiService {
  private readonly logger = new Logger(CtiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private readonly contactBrief = {
    select: { id: true, name: true },
  } as const;

  // ------------------------------------------------------------
  // 통화 이벤트 수집 (Bridge → Electron → 여기)
  // ------------------------------------------------------------

  async ingestCallEvent(officeId: string, userId: string, dto: CallEventDto) {
    switch (dto.type) {
      case 'ring':
        return this.handleRing(officeId, userId, dto);
      case 'terminate':
        return this.handleTerminate(officeId, userId, dto);
      case 'ctc_result':
        // 클릭투콜 발신 결과 — 발신 CallLog는 Phase 후속 (docs/CTI_BRIDGE_PLAN.md Step 5)
        this.logger.debug(`ctc_result ignored: ${dto.caller} -> ${dto.callee}`);
        return { handled: false as const };
    }
  }

  /**
   * 통신사 seqno는 통신사/브리지 재시작에 따라 재사용될 수 있으므로
   * 발생일(UTC) 버킷을 붙여 dedupe 키로 쓴다. 자정을 넘긴 terminate는
   * 전날 키도 함께 조회한다.
   */
  private static ringDedupeKey(seqno: string, occurredAt: Date): string {
    const day = occurredAt.toISOString().slice(0, 10).replace(/-/g, '');
    return `${seqno}#${day}`;
  }

  private parseOccurredAt(raw: string): Date {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      // @IsISO8601은 주차(2026-W27)/서수 날짜 등 Date가 못 읽는 포맷도 통과시킨다
      throw new BadRequestException(`occurredAt을 해석할 수 없습니다: ${raw}`);
    }
    return parsed;
  }

  private findContactByPhone(officeId: string, phoneNumber: string) {
    return this.prisma.contactPhone.findFirst({
      where: { officeId, phone: phoneNumber },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { contactId: true, contact: this.contactBrief },
    });
  }

  private async handleRing(
    officeId: string,
    userId: string,
    dto: CallEventDto,
  ) {
    const phoneNumber = normalizePhone(dto.caller);
    const occurredAt = this.parseOccurredAt(dto.occurredAt);
    const lineNumber = dto.lineId ?? dto.callee ?? null;

    const matchedPhone = await this.findContactByPhone(officeId, phoneNumber);

    const data = {
      officeId,
      userId,
      contactId: matchedPhone?.contactId ?? null,
      direction: 'inbound',
      phoneNumber,
      lineNumber,
      vendor: dto.vendor,
      vendorSeqno: null as string | null,
      status: 'ringing',
      startedAt: occurredAt,
    };

    let callLog;
    let created: boolean;

    if (dto.seqno) {
      const key = CtiService.ringDedupeKey(dto.seqno, occurredAt);
      ({ callLog, created } = await this.createRingDeduped(
        officeId,
        dto.vendor,
        key,
        data,
      ));
    } else {
      callLog = await this.prisma.callLog.create({
        data,
        include: { contact: this.contactBrief },
      });
      created = true;
    }

    // 같은 통화의 중복 보고(멀티 PC)에는 다시 emit하지 않는다
    if (created) {
      this.realtime.emitCtiIncoming({
        officeId,
        callLogId: callLog.id,
        phoneNumber: callLog.phoneNumber,
        lineNumber: callLog.lineNumber,
        contact: callLog.contact
          ? { id: callLog.contact.id, name: callLog.contact.name }
          : null,
        startedAt: callLog.startedAt.toISOString(),
      });
    }

    return { handled: true as const, deduped: !created, callLog };
  }

  /**
   * 멀티 PC가 같은 통화를 동시에 보고하는 것이 정상 경로(KT 1회선 → 최대 4 PC)이므로
   * create + P2002 catch로 원자적으로 dedupe한다. (Prisma upsert는 이 조건에서
   * findUnique→create로 에뮬레이션되어 동시 요청 시 P2002가 그대로 터진다.)
   */
  private async createRingDeduped(
    officeId: string,
    vendor: string,
    key: string,
    data: Record<string, unknown>,
  ) {
    try {
      const callLog = await this.prisma.callLog.create({
        data: {
          ...data,
          vendorSeqno: key,
        } as Prisma.CallLogUncheckedCreateInput,
        include: { contact: this.contactBrief },
      });
      return { callLog, created: true };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existing = await this.prisma.callLog.findUnique({
        where: {
          officeId_vendor_vendorSeqno: { officeId, vendor, vendorSeqno: key },
        },
        include: { contact: this.contactBrief },
      });

      if (existing && existing.phoneNumber === data.phoneNumber) {
        return { callLog: existing, created: false };
      }

      // 같은 키인데 발신번호가 다르면 seqno 재사용(당일 브리지 재시작 등) —
      // 새 통화를 잃거나 과거 로그에 오귀속시키지 않도록 유니크 접미사로 저장
      this.logger.warn(
        `vendorSeqno 재사용 감지: ${vendor}/${key} (기존 ${existing?.phoneNumber} ≠ ${data.phoneNumber})`,
      );
      const callLog = await this.prisma.callLog.create({
        data: {
          ...data,
          vendorSeqno: `${key}~${randomUUID().slice(0, 8)}`,
        } as Prisma.CallLogUncheckedCreateInput,
        include: { contact: this.contactBrief },
      });
      return { callLog, created: true };
    }
  }

  private async handleTerminate(
    officeId: string,
    userId: string,
    dto: CallEventDto,
  ) {
    const phoneNumber = normalizePhone(dto.caller);
    const occurredAt = this.parseOccurredAt(dto.occurredAt);
    const durationSec = dto.durationSec ?? 0;
    const direction = dto.direction ?? 'inbound';
    // 발신 통화는 "부재중" 개념이 없다 — 0초여도 ended(불발신)로 기록
    const status =
      durationSec > 0 || direction === 'outbound' ? 'ended' : 'missed';

    let existing = null;

    if (dto.seqno) {
      const keys = [
        CtiService.ringDedupeKey(dto.seqno, occurredAt),
        // 자정 넘김: ring이 전날 키로 저장된 경우
        CtiService.ringDedupeKey(
          dto.seqno,
          new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000),
        ),
      ];
      for (const key of keys) {
        const byKey = await this.prisma.callLog.findUnique({
          where: {
            officeId_vendor_vendorSeqno: {
              officeId,
              vendor: dto.vendor,
              vendorSeqno: key,
            },
          },
        });
        // seqno 재사용으로 다른 통화가 잡히는 것을 방지
        if (byKey && byKey.phoneNumber === phoneNumber) {
          existing = byKey;
          break;
        }
      }
    }

    // 번호+시간창 fallback은 데스크톱 CTI의 "ring 유실 보정"용이다.
    // 모바일은 단말 1대가 통화 1건당 정확히 1회 보고(ring 없음)하므로 이 보정이
    // 오히려 같은 번호 연속 통화를 이전 통화의 중복 보고로 오판해 유실시킨다 → 건너뜀.
    const usePhoneWindowFallback = dto.vendor !== 'mobile';
    if (!existing && usePhoneWindowFallback) {
      existing = await this.prisma.callLog.findFirst({
        where: {
          officeId,
          phoneNumber,
          direction, // 모바일 발신 종료가 수신 ringing 행을 닫지 않도록
          startedAt: {
            gte: new Date(occurredAt.getTime() - TERMINATE_MATCH_WINDOW_MS),
          },
        },
        orderBy: { startedAt: 'desc' },
      });
    }

    if (
      existing &&
      existing.status !== 'ringing' &&
      existing.status !== 'answered'
    ) {
      // 이미 다른 PC의 terminate가 종료 처리 — endedAt이 근접하면 중복 보고로 간주
      const closeInTime =
        existing.endedAt &&
        Math.abs(existing.endedAt.getTime() - occurredAt.getTime()) <
          TERMINATE_DEDUPE_WINDOW_MS;
      if (closeInTime) {
        return { handled: true as const, deduped: true, callLog: existing };
      }
      // 오래된 완료 통화 — 새 통화의 terminate로 취급
      existing = null;
    }

    let callLog;
    if (existing) {
      callLog = await this.prisma.callLog.update({
        where: { id: existing.id },
        data: { status, durationSec, endedAt: occurredAt },
        include: { contact: this.contactBrief },
      });
    } else {
      // ring 유실(Bridge 재시작 등) — terminate만으로도 통화 사실은 남긴다
      const matchedPhone = await this.findContactByPhone(officeId, phoneNumber);
      const vendorSeqnoKey = dto.seqno
        ? CtiService.ringDedupeKey(dto.seqno, occurredAt)
        : null;
      try {
        callLog = await this.prisma.callLog.create({
          data: {
            officeId,
            userId,
            contactId: matchedPhone?.contactId ?? null,
            direction,
            phoneNumber,
            lineNumber: dto.lineId ?? dto.callee ?? null,
            vendor: dto.vendor,
            vendorSeqno: vendorSeqnoKey,
            status,
            durationSec,
            startedAt: new Date(occurredAt.getTime() - durationSec * 1000),
            endedAt: occurredAt,
          },
          include: { contact: this.contactBrief },
        });
      } catch (error) {
        // 멀티 PC가 같은 terminate를 동시에 보고 — 먼저 만든 쪽의 행을 채택
        // (seqno 없는 이벤트는 unique 키가 없어 이 방어가 불가능하지만,
        //  mock 수동 입력 외에는 seqno가 항상 있다)
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          vendorSeqnoKey
        ) {
          const winner = await this.prisma.callLog.findUnique({
            where: {
              officeId_vendor_vendorSeqno: {
                officeId,
                vendor: dto.vendor,
                vendorSeqno: vendorSeqnoKey,
              },
            },
            include: { contact: this.contactBrief },
          });
          if (winner) {
            return { handled: true as const, deduped: true, callLog: winner };
          }
        }
        throw error;
      }
    }

    this.realtime.emitCtiCallUpdated({
      officeId,
      callLogId: callLog.id,
      status: callLog.status,
      durationSec: callLog.durationSec,
    });

    return { handled: true as const, deduped: false, callLog };
  }

  // ------------------------------------------------------------
  // 발신번호 조회 (통화 팝업용 고객 카드)
  // ------------------------------------------------------------

  async lookup(officeId: string, rawPhone: string) {
    if (!rawPhone?.trim()) {
      throw new BadRequestException('phone 쿼리 파라미터가 필요합니다');
    }
    const phone = normalizePhone(rawPhone.trim());

    const [matchedPhone, vendorContacts, recentCalls] = await Promise.all([
      this.prisma.contactPhone.findFirst({
        where: { officeId, phone },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          contact: { select: { id: true, name: true, tags: true, memo: true } },
        },
      }),
      this.prisma.vendorContact.findMany({
        where: {
          normalizedPhone: phone,
          vendor: { isActive: true, OR: [{ officeId }, { officeId: null }] },
        },
        select: {
          id: true,
          name: true,
          phone: true,
          role: true,
          vendor: { select: { id: true, name: true } },
        },
        take: 5,
      }),
      this.prisma.callLog.findMany({
        where: { officeId, phoneNumber: phone },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          direction: true,
          status: true,
          durationSec: true,
          startedAt: true,
        },
      }),
    ]);

    const contact = matchedPhone?.contact ?? null;

    if (!contact) {
      return {
        phone,
        isNew: vendorContacts.length === 0,
        contact: null,
        vendorContacts,
        recentConsultations: [],
        properties: [],
        buyerRequirement: null,
        openTasks: [],
        recentCalls,
      };
    }

    const [recentConsultations, propertyContacts, buyerRequirement, openTasks] =
      await Promise.all([
        this.prisma.consultation.findMany({
          where: { officeId, contactId: contact.id },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, type: true, content: true, createdAt: true },
        }),
        this.prisma.propertyContact.findMany({
          where: { officeId, contactId: contact.id, status: 'active' },
          take: 5,
          select: {
            role: true,
            property: {
              select: {
                id: true,
                site: { select: { id: true, name: true } },
                unit: {
                  select: {
                    id: true,
                    name: true,
                    dong: { select: { name: true, isPlaceholder: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.buyerRequirement.findFirst({
          where: {
            officeId,
            status: 'active',
            buyerIntake: {
              contacts: { some: { contactId: contact.id } },
            },
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            transactionType: true,
            siteTypes: true,
            priceMin: true,
            priceMax: true,
            depositMin: true,
            depositMax: true,
            monthlyRentMin: true,
            monthlyRentMax: true,
            urgency: true,
          },
        }),
        this.prisma.task.findMany({
          where: {
            officeId,
            contactId: contact.id,
            status: { in: ['pending', 'in_progress'] },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          take: 5,
          select: { id: true, title: true, status: true, dueDate: true },
        }),
      ]);

    return {
      phone,
      isNew: false,
      contact,
      vendorContacts,
      recentConsultations,
      properties: propertyContacts,
      buyerRequirement,
      openTasks,
      recentCalls,
    };
  }

  // ------------------------------------------------------------
  // 통화 이력
  // ------------------------------------------------------------

  async listCallLogs(officeId: string, query: CallLogListQuery) {
    // NaN(비숫자 쿼리 파라미터)이 Prisma까지 흐르지 않도록 방어
    const rawPage = Number(query.page);
    const page =
      Number.isFinite(rawPage) && rawPage >= 1 ? Math.trunc(rawPage) : 1;
    const rawLimit = Number(query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.trunc(rawLimit)))
      : 20;

    const where: Prisma.CallLogWhereInput = {
      officeId,
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.phone ? { phoneNumber: normalizePhone(query.phone) } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.callLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contact: this.contactBrief,
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.callLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateCallLog(officeId: string, id: string, dto: UpdateCallLogDto) {
    const existing = await this.prisma.callLog.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('통화 기록을 찾을 수 없습니다');
    }

    if (dto.consultationId) {
      const consultation = await this.prisma.consultation.findFirst({
        where: { id: dto.consultationId, officeId },
        select: { id: true },
      });
      if (!consultation) {
        throw new BadRequestException('해당 상담을 찾을 수 없습니다');
      }
    }

    if (dto.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: dto.contactId, officeId },
        select: { id: true },
      });
      if (!contact) {
        throw new BadRequestException('해당 연락처를 찾을 수 없습니다');
      }
    }

    if (dto.recordingId) {
      const recording = await this.prisma.callRecording.findFirst({
        where: { id: dto.recordingId, officeId },
        select: { id: true },
      });
      if (!recording) {
        throw new BadRequestException('해당 녹음을 찾을 수 없습니다');
      }
    }

    return this.prisma.callLog.update({
      where: { id },
      data: {
        ...(dto.memo !== undefined ? { memo: dto.memo } : {}),
        ...(dto.contactId !== undefined ? { contactId: dto.contactId } : {}),
        ...(dto.consultationId !== undefined
          ? { consultationId: dto.consultationId }
          : {}),
        ...(dto.recordingId !== undefined
          ? { recordingId: dto.recordingId }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { contact: this.contactBrief },
    });
  }
}
