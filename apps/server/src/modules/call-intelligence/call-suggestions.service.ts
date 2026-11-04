import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CallSuggestionStatus,
  CallSuggestionType,
  normalizeMatchStage,
} from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BuyerRequirementsService } from '../buyer-requirements/buyer-requirements.service';
import { CalendarEventsService } from '../calendar-events/calendar-events.service';
import { ListingIntakesService } from '../listing-intakes/listing-intakes.service';
import { ListingsService } from '../listings/listings.service';
import { MatchesService } from '../matches/matches.service';
import { TasksService } from '../tasks/tasks.service';
import {
  type BuyerRequirementFields,
  isCallSuggestionType,
  type SuggestionPayload,
  type SuggestionPayloadByType,
  validateSuggestionPayload,
} from './call-suggestion.payload';

/**
 * 통화 분석 제안 반영·무시.
 * 반영은 각 도메인 서비스(할 일·일정·고객 요청·매칭·매물 확인)를 그대로 거쳐
 * 기존 규칙(매칭 단계 순서, 매물 확인 → 의뢰 종료 등)을 똑같이 적용한다.
 *
 * 반영은 여러 번 실행돼도 한 번만 적용된다. 도메인 서비스 쓰기와 제안 상태 저장을 한
 * 트랜잭션으로 묶을 수 없는 경우가 있어, 상태 저장이 실패해 다시 반영할 때를 대비한다.
 * - 도메인에 쓰기 전에 이번에 반영할 내용(appliedPayload)을 먼저 기록한다.
 * - 다시 반영할 때 앞선 시도가 이미 적용됐으면(제안 id로 만든 행, 이 통화의 매물 확인 기록,
 *   기록한 매칭 단계) 새로 쓰지 않고 실제로 적용된 내용으로 마무리한다. 이번 요청 내용이
 *   그와 다르면 바뀐 내용이 반영된 것처럼 꾸미지 않고 알려준다.
 * - 새로 만드는 것(할 일·일정·고객 요청·매칭)은 제안 id를 새 행의 id로 써 동시에 반영해도 한 건만 생긴다.
 * - 고객 요청 변경(메모 덧붙임 포함)은 상태 저장과 한 트랜잭션으로 처리한다.
 */

/** 앞선 시도가 이미 반영돼 있는데 이번 요청 내용이 다를 때 */
const ALREADY_APPLIED_DIFFERENTLY =
  '앞서 반영한 내용으로 이미 처리돼 있어요. 바꾸려면 만들어진 항목에서 직접 고쳐 주세요';

/** 반영 중 서버가 멈춰 'applying'에 남은 제안을 다시 처리할 수 있게 되는 시간 */
const STALE_APPLYING_MS = 2 * 60_000;

const SUGGESTION_SELECT = {
  id: true,
  recordingId: true,
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
  updatedAt: true,
} satisfies Prisma.CallActionSuggestionSelect;

interface ApplyContext {
  officeId: string;
  userId: string;
  suggestionId: string;
  consultationId: string | null;
  recording: { id: string; contactId: string | null; userId: string; calledAt: Date };
}

interface Applied {
  entityType: string;
  entityId: string;
}

@Injectable()
export class CallSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly buyerRequirements: BuyerRequirementsService,
    private readonly matches: MatchesService,
    private readonly listingIntakes: ListingIntakesService,
    private readonly listings: ListingsService,
  ) {}

  findAll(officeId: string, query: { recordingId?: string; status?: string } = {}) {
    return this.prisma.callActionSuggestion.findMany({
      where: {
        officeId,
        ...(query.recordingId ? { recordingId: query.recordingId } : {}),
        ...(query.status ? { status: { in: query.status.split(',').map((status) => status.trim()) } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { seq: 'asc' }],
      take: 200,
      select: SUGGESTION_SELECT,
    });
  }

  async accept(id: string, officeId: string, userId: string, editedPayload?: unknown) {
    const suggestion = await this.prisma.callActionSuggestion.findFirst({
      where: { id, officeId },
      include: {
        recording: { select: { id: true, contactId: true, userId: true, calledAt: true } },
      },
    });
    if (!suggestion) throw new NotFoundException('제안을 찾을 수 없습니다');
    if (suggestion.status === CallSuggestionStatus.ACCEPTED) {
      throw new ConflictException('이미 반영한 제안입니다');
    }
    if (suggestion.status === CallSuggestionStatus.DISMISSED) {
      throw new ConflictException('무시한 제안입니다. 되돌린 뒤 반영해 주세요');
    }
    if (!isCallSuggestionType(suggestion.type)) {
      throw new BadRequestException('알 수 없는 제안 종류입니다');
    }
    // 분석 뒤 통화 상대를 바꿨으면 이전 고객 기준 제안이다
    if (suggestion.contactId !== suggestion.recording.contactId) {
      throw new ConflictException('통화 상대가 바뀌어 이 제안은 반영할 수 없습니다. 다시 분석해 주세요');
    }
    const type = suggestion.type;
    const validation = validateSuggestionPayload(type, editedPayload ?? suggestion.payload);
    if (!validation.ok) throw new BadRequestException(validation.error);

    const claimed = await this.prisma.callActionSuggestion.updateMany({
      where: {
        id,
        officeId,
        OR: [
          { status: CallSuggestionStatus.PENDING },
          {
            status: CallSuggestionStatus.APPLYING,
            updatedAt: { lt: new Date(Date.now() - STALE_APPLYING_MS) },
          },
        ],
      },
      data: { status: CallSuggestionStatus.APPLYING },
    });
    if (claimed.count === 0) {
      throw new ConflictException('다른 사용자가 처리 중이거나 이미 처리한 제안입니다');
    }

    const payload = validation.payload;
    const finalize = (
      applied: Applied,
      appliedPayload: unknown,
      client: Pick<Prisma.TransactionClient, 'callActionSuggestion'> = this.prisma,
    ) =>
      client.callActionSuggestion.update({
        where: { id },
        data: {
          status: CallSuggestionStatus.ACCEPTED,
          appliedEntityType: applied.entityType,
          appliedEntityId: applied.entityId,
          appliedPayload: appliedPayload as Prisma.InputJsonValue,
          resolvedById: userId,
          resolvedAt: new Date(),
        },
        select: SUGGESTION_SELECT,
      });

    let appliedDifferently = false;
    try {
      // 처리 권한을 얻은 뒤의 최신 상태로 판단한다. 처음 읽은 값은 그 사이 다른 요청이
      // 반영을 시도(내용 기록·생성)하고 실패해 되돌렸을 수 있어 낡았을 수 있다.
      const current = await this.prisma.callActionSuggestion.findFirst({
        where: { id, officeId },
        select: {
          appliedPayload: true,
          contactId: true,
          consultationId: true,
          recording: { select: { id: true, contactId: true, userId: true, calledAt: true } },
        },
      });
      if (!current) throw new NotFoundException('제안을 찾을 수 없습니다');
      if (current.contactId !== current.recording.contactId) {
        throw new ConflictException('통화 상대가 바뀌어 이 제안은 반영할 수 없습니다. 다시 분석해 주세요');
      }
      const context: ApplyContext = {
        officeId,
        userId,
        suggestionId: id,
        consultationId: current.consultationId,
        recording: current.recording,
      };

      await this.assertReferencesBelongToOffice(officeId, payload);
      await this.assertTargetsBelongToCaller(officeId, payload, current.recording.contactId);

      // 앞선 시도가 적용까지 됐는데 상태 저장만 실패했던 경우: 실제로 적용된 내용으로 마무리한다
      const prior = (current.appliedPayload ?? null) as SuggestionPayload | null;
      const priorEffect = await this.findPriorEffect(type, prior, context);
      if (priorEffect) {
        // 적용된 내용을 모르면(기록 없음) 이번 내용으로 꾸미지 않는다
        const finalized = await finalize(priorEffect, prior ?? Prisma.DbNull);
        if (prior && stableJson(prior) === stableJson(payload)) return finalized;
        appliedDifferently = true;
      } else {
        // 도메인에 쓰기 전에 이번 내용을 기록해 둔다 (다시 시도할 때 무엇이 적용됐는지 알 수 있게)
        await this.prisma.callActionSuggestion.update({
          where: { id },
          data: { appliedPayload: payload as unknown as Prisma.InputJsonValue },
        });
        if (type === CallSuggestionType.BUYER_REQUIREMENT_UPDATE) {
          return await this.applyRequirementUpdate(
            payload as SuggestionPayloadByType['buyer_requirement_update'],
            context,
            finalize,
          );
        }
        const applied = await this.apply(type, payload, context);
        return await finalize(applied, payload);
      }
    } catch (error) {
      await this.prisma.callActionSuggestion
        .update({ where: { id }, data: { status: CallSuggestionStatus.PENDING } })
        .catch(() => undefined);
      throw error;
    }
    if (appliedDifferently) throw new ConflictException(ALREADY_APPLIED_DIFFERENTLY);
    throw new ConflictException('이미 처리한 제안입니다');
  }

  /**
   * 앞선 시도가 이미 적용됐는지. 적용됐으면 그 결과를 돌려준다.
   * - 새로 만드는 것: 제안 id로 만든 행이 있다
   * - 매물 확인: 이 통화로 남긴 그 의뢰의 확인 기록이 있다 (가격 변경은 확인 전에 끝난다)
   * - 매칭 단계: 앞서 기록한 단계에 이미 와 있다
   * - 고객 요청 변경: 상태 저장과 한 트랜잭션이라 반쯤 적용된 경우가 없다
   */
  private async findPriorEffect(
    type: CallSuggestionType,
    prior: SuggestionPayload | null,
    context: ApplyContext,
  ): Promise<Applied | null> {
    const own = { id: context.suggestionId, officeId: context.officeId };
    const select = { id: true } as const;
    const found = (entityType: string, row: unknown) =>
      row ? { entityType, entityId: context.suggestionId } : null;
    switch (type) {
      case CallSuggestionType.TASK:
        return found('task', await this.prisma.task.findFirst({ where: own, select }));
      case CallSuggestionType.CALENDAR_EVENT:
        return found('calendar_event', await this.prisma.calendarEvent.findFirst({ where: own, select }));
      case CallSuggestionType.BUYER_REQUIREMENT_CREATE:
        return found('buyer_requirement', await this.prisma.buyerRequirement.findFirst({ where: own, select }));
      case CallSuggestionType.MATCH_CREATE:
        return found('match', await this.prisma.match.findFirst({ where: own, select }));
      case CallSuggestionType.LISTING_CONFIRM: {
        const intakeId = (prior as SuggestionPayloadByType['listing_confirm'] | null)?.intakeId;
        if (!intakeId) return null;
        const confirmed = await this.prisma.consultation.findFirst({
          where: {
            officeId: context.officeId,
            callRecordingId: context.recording.id,
            listingIntakeId: intakeId,
            purpose: 'listing_confirm',
          },
          select,
        });
        return confirmed ? { entityType: 'listing_intake', entityId: intakeId } : null;
      }
      case CallSuggestionType.MATCH_STAGE: {
        const stagePayload = prior as SuggestionPayloadByType['match_stage'] | null;
        if (!stagePayload) return null;
        const match = await this.prisma.match.findFirst({
          where: { id: stagePayload.matchId, officeId: context.officeId },
          select: { stage: true },
        });
        return match && normalizeMatchStage(match.stage) === stagePayload.stage
          ? { entityType: 'match', entityId: stagePayload.matchId }
          : null;
      }
      default:
        return null;
    }
  }

  async dismiss(id: string, officeId: string, userId: string) {
    const updated = await this.prisma.callActionSuggestion.updateMany({
      where: { id, officeId, status: CallSuggestionStatus.PENDING },
      data: {
        status: CallSuggestionStatus.DISMISSED,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });
    if (updated.count === 0) await this.throwNotPending(id, officeId);
    return this.findOne(id, officeId);
  }

  /** 무시한 제안을 다시 처리 대기로 되돌린다 */
  async restore(id: string, officeId: string) {
    const updated = await this.prisma.callActionSuggestion.updateMany({
      where: { id, officeId, status: CallSuggestionStatus.DISMISSED },
      data: { status: CallSuggestionStatus.PENDING, resolvedById: null, resolvedAt: null },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.callActionSuggestion.findFirst({ where: { id, officeId }, select: { id: true } });
      if (!exists) throw new NotFoundException('제안을 찾을 수 없습니다');
      throw new ConflictException('무시한 제안만 되돌릴 수 있습니다');
    }
    return this.findOne(id, officeId);
  }

  private async findOne(id: string, officeId: string) {
    const suggestion = await this.prisma.callActionSuggestion.findFirst({
      where: { id, officeId },
      select: SUGGESTION_SELECT,
    });
    if (!suggestion) throw new NotFoundException('제안을 찾을 수 없습니다');
    return suggestion;
  }

  private async throwNotPending(id: string, officeId: string): Promise<never> {
    const suggestion = await this.prisma.callActionSuggestion.findFirst({
      where: { id, officeId },
      select: { status: true },
    });
    if (!suggestion) throw new NotFoundException('제안을 찾을 수 없습니다');
    throw new ConflictException('이미 처리한 제안입니다');
  }

  /** 사람이 고친 내용에 다른 사무소의 id가 들어오지 않게 한다 */
  private async assertReferencesBelongToOffice(officeId: string, payload: SuggestionPayload) {
    const values = payload as unknown as Record<string, unknown>;
    const changes = (values.changes ?? {}) as BuyerRequirementFields;
    const priceChanges = (values.priceChanges ?? []) as Array<{ listingId: string }>;
    const listingIds = new Set<string>(
      [values.listingId, ...priceChanges.map((change) => change.listingId)].filter(
        (value): value is string => typeof value === 'string',
      ),
    );
    const siteIds = [...((values.siteIds as string[] | undefined) ?? []), ...(changes.siteIds ?? [])];

    const checks: Array<Promise<void>> = [];
    const check = async (label: string, count: Promise<number>, expected: number) => {
      if ((await count) !== expected) throw new NotFoundException(`${label}을(를) 찾을 수 없습니다`);
    };
    if (listingIds.size > 0) {
      checks.push(check('매물', this.prisma.listing.count({ where: { officeId, id: { in: [...listingIds] } } }), listingIds.size));
    }
    const single: Array<[string, unknown, (id: string) => Promise<number>]> = [
      ['호실', values.propertyId, (id) => this.prisma.property.count({ where: { officeId, id } })],
      ['고객 요청', values.buyerReqId, (id) => this.prisma.buyerRequirement.count({ where: { officeId, id } })],
      ['매칭', values.matchId, (id) => this.prisma.match.count({ where: { officeId, id } })],
      ['의뢰', values.intakeId, (id) => this.prisma.listingIntake.count({ where: { officeId, id } })],
      ['구매 의뢰', values.buyerIntakeId, (id) => this.prisma.buyerIntake.count({ where: { officeId, id } })],
    ];
    for (const [label, value, count] of single) {
      if (typeof value === 'string') checks.push(check(label, count(value), 1));
    }
    if (siteIds.length > 0) {
      const unique = [...new Set(siteIds)];
      checks.push(
        check(
          '단지',
          this.prisma.site.count({ where: { id: { in: unique }, OR: [{ isPublic: true }, { officeId }] } }),
          unique.length,
        ),
      );
    }
    await Promise.all(checks);
  }

  /**
   * 고객 요청·매칭·매물 의뢰는 통화 상대 본인 것이어야 한다.
   * (분석은 통화 상대의 데이터만 보여주지만, 고친 내용으로 다른 고객 것을 가리킬 수 없게 한다)
   */
  private async assertTargetsBelongToCaller(
    officeId: string,
    payload: SuggestionPayload,
    contactId: string | null,
  ) {
    const values = payload as unknown as Record<string, unknown>;
    const buyerReqId = typeof values.buyerReqId === 'string' ? values.buyerReqId : null;
    const matchId = typeof values.matchId === 'string' ? values.matchId : null;
    const intakeId = typeof values.intakeId === 'string' ? values.intakeId : null;
    if (!buyerReqId && !matchId && !intakeId) return;
    if (!contactId) throw new BadRequestException('통화 상대 연락처를 먼저 연결해 주세요');

    const callerIntake = { contacts: { some: { contactId } } };
    const checks: Array<[string, Promise<number>]> = [];
    if (buyerReqId) {
      checks.push([
        '통화 상대의 고객 요청',
        this.prisma.buyerRequirement.count({ where: { id: buyerReqId, officeId, buyerIntake: callerIntake } }),
      ]);
    }
    if (matchId) {
      checks.push([
        '통화 상대의 매칭',
        this.prisma.match.count({
          where: { id: matchId, officeId, buyerRequirement: { buyerIntake: callerIntake } },
        }),
      ]);
    }
    if (intakeId) {
      checks.push([
        '통화 상대의 매물 의뢰',
        this.prisma.listingIntake.count({
          where: {
            id: intakeId,
            officeId,
            property: { propertyContacts: { some: { contactId, status: 'active' } } },
          },
        }),
      ]);
    }
    for (const [label, count] of checks) {
      if ((await count) === 0) throw new BadRequestException(`${label}이(가) 아닙니다`);
    }
  }

  private apply(type: CallSuggestionType, payload: SuggestionPayload, context: ApplyContext): Promise<Applied> {
    switch (type) {
      case CallSuggestionType.TASK:
        return this.applyTask(payload as SuggestionPayloadByType['task'], context);
      case CallSuggestionType.CALENDAR_EVENT:
        return this.applyCalendarEvent(payload as SuggestionPayloadByType['calendar_event'], context);
      case CallSuggestionType.BUYER_REQUIREMENT_CREATE:
        return this.applyRequirementCreate(payload as SuggestionPayloadByType['buyer_requirement_create'], context);
      case CallSuggestionType.BUYER_REQUIREMENT_UPDATE:
        // 상태 저장과 한 트랜잭션으로 accept()에서 처리한다
        throw new Error('buyer_requirement_update is applied together with its state');
      case CallSuggestionType.MATCH_CREATE:
        return this.applyMatchCreate(payload as SuggestionPayloadByType['match_create'], context);
      case CallSuggestionType.MATCH_STAGE:
        return this.applyMatchStage(payload as SuggestionPayloadByType['match_stage'], context);
      case CallSuggestionType.LISTING_CONFIRM:
        return this.applyListingConfirm(payload as SuggestionPayloadByType['listing_confirm'], context);
    }
  }

  /** 제안 id로 새 행을 만든다. 동시에 같은 제안을 반영하면 기본키가 두 번째를 막는다. */
  private async createOnce(
    entityType: string,
    context: ApplyContext,
    exists: () => Promise<unknown>,
    create: () => Promise<{ id: string }>,
  ): Promise<Applied> {
    try {
      const created = await create();
      return { entityType, entityId: created.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (await exists())
      ) {
        return { entityType, entityId: context.suggestionId };
      }
      throw error;
    }
  }

  private applyTask(payload: SuggestionPayloadByType['task'], context: ApplyContext): Promise<Applied> {
    const where = { id: context.suggestionId, officeId: context.officeId };
    return this.createOnce('task', context, () => this.prisma.task.findFirst({ where, select: { id: true } }), () => this.tasks.create(
      context.officeId,
      {
        title: payload.title,
        content: payload.content ?? undefined,
        dueDate: payload.dueDate ?? undefined,
        priority: payload.priority,
        source: 'ai',
        // 통화한 직원에게 맡긴다
        assignedToId: context.recording.userId,
        contactId: context.recording.contactId ?? undefined,
        consultationId: context.consultationId ?? undefined,
        listingId: payload.listingId ?? undefined,
        propertyId: payload.propertyId ?? undefined,
        buyerReqId: payload.buyerReqId ?? undefined,
        matchId: payload.matchId ?? undefined,
      },
      context.userId,
      { id: context.suggestionId },
    ));
  }

  private applyCalendarEvent(
    payload: SuggestionPayloadByType['calendar_event'],
    context: ApplyContext,
  ): Promise<Applied> {
    const where = { id: context.suggestionId, officeId: context.officeId };
    return this.createOnce(
      'calendar_event',
      context,
      () => this.prisma.calendarEvent.findFirst({ where, select: { id: true } }),
      () => this.calendarEvents.create(context.officeId, context.recording.userId, {
      title: payload.title,
      description: payload.description ?? undefined,
      type: payload.eventType,
      allDay: payload.allDay,
      start: payload.start,
      end: payload.end ?? undefined,
      contactId: context.recording.contactId ?? undefined,
      listingId: payload.listingId ?? undefined,
      propertyId: payload.propertyId ?? undefined,
      matchId: payload.matchId ?? undefined,
    }, { id: context.suggestionId }),
    );
  }

  private requireContact(context: ApplyContext): string {
    if (!context.recording.contactId) {
      throw new BadRequestException('통화 상대 연락처를 먼저 연결해 주세요');
    }
    return context.recording.contactId;
  }

  private async applyRequirementCreate(
    payload: SuggestionPayloadByType['buyer_requirement_create'],
    context: ApplyContext,
  ): Promise<Applied> {
    const contactId = this.requireContact(context);
    const { buyerIntakeId, memo, siteIds, ...fields } = payload;
    const where = { id: context.suggestionId, officeId: context.officeId };
    return this.createOnce(
      'buyer_requirement',
      context,
      () => this.prisma.buyerRequirement.findFirst({ where, select: { id: true } }),
      () =>
        this.buyerRequirements.create(
          context.officeId,
          {
            // 구매 의뢰를 지정해도 통화 상대가 참여한 의뢰여야 한다 (서비스가 확인)
            ...(buyerIntakeId ? { buyerIntakeId, contactId } : { contactId }),
            ...withoutNulls(fields),
            memo: memo ?? undefined,
            preferredSites: siteIds?.map((siteId, index) => ({ siteId, priority: index + 1 })),
            assignedToId: context.recording.userId,
          },
          { id: context.suggestionId },
        ),
    );
  }

  /** 고객 요청 변경과 제안 상태 저장을 한 트랜잭션으로 처리한다 (메모가 두 번 붙지 않는다) */
  private applyRequirementUpdate(
    payload: SuggestionPayloadByType['buyer_requirement_update'],
    context: ApplyContext,
    finalize: (
      applied: Applied,
      appliedPayload: unknown,
      client: Pick<Prisma.TransactionClient, 'callActionSuggestion'>,
    ) => Promise<unknown>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.buyerRequirement.findFirst({
        where: { id: payload.buyerReqId, officeId: context.officeId },
        select: { memo: true, preferredSites: { select: { siteId: true, priority: true, memo: true } } },
      });
      if (!existing) throw new NotFoundException('고객 요청을 찾을 수 없습니다');

      const { siteIds, moveInDate, ...changes } = payload.changes;
      // 희망 단지는 기존 목록에 더한다
      const newSiteIds = (siteIds ?? []).filter(
        (siteId) => !existing.preferredSites.some((site) => site.siteId === siteId),
      );
      const preferredSites =
        newSiteIds.length > 0
          ? [
              ...existing.preferredSites.map((site) => ({
                siteId: site.siteId,
                priority: site.priority,
                memo: site.memo,
              })),
              ...newSiteIds.map((siteId, index) => ({
                siteId,
                priority: existing.preferredSites.length + index + 1,
              })),
            ]
          : undefined;

      await tx.buyerRequirement.update({
        where: { id: payload.buyerReqId },
        data: {
          ...changes,
          ...(moveInDate !== undefined ? { moveInDate: moveInDate ? new Date(moveInDate) : null } : {}),
          ...(payload.memoAppend
            ? { memo: [existing.memo?.trim(), payload.memoAppend].filter(Boolean).join('\n') }
            : {}),
          ...(preferredSites ? { preferredSites: { deleteMany: {}, create: preferredSites } } : {}),
          lastContactDate: context.recording.calledAt,
        },
      });
      return finalize({ entityType: 'buyer_requirement', entityId: payload.buyerReqId }, payload, tx);
    });
  }

  private async applyMatchCreate(
    payload: SuggestionPayloadByType['match_create'],
    context: ApplyContext,
  ): Promise<Applied> {
    const where = { id: context.suggestionId, officeId: context.officeId };
    return this.createOnce(
      'match',
      context,
      () => this.prisma.match.findFirst({ where, select: { id: true } }),
      () =>
        this.matches.create(
          context.officeId,
          { listingId: payload.listingId, buyerReqId: payload.buyerReqId, memo: payload.memo ?? undefined },
          { id: context.suggestionId },
        ),
    );
  }

  private async applyMatchStage(
    payload: SuggestionPayloadByType['match_stage'],
    context: ApplyContext,
  ): Promise<Applied> {
    const match = await this.prisma.match.findFirst({
      where: { id: payload.matchId, officeId: context.officeId },
      select: { stage: true },
    });
    if (!match) throw new NotFoundException('매칭을 찾을 수 없습니다');
    // 이미 그 단계면 다시 바꾸지 않는다
    if (normalizeMatchStage(match.stage) !== payload.stage) {
      await this.matches.updateStage(payload.matchId, context.officeId, { stage: payload.stage });
    }
    return { entityType: 'match', entityId: payload.matchId };
  }

  private async applyListingConfirm(
    payload: SuggestionPayloadByType['listing_confirm'],
    context: ApplyContext,
  ): Promise<Applied> {
    const contactId = this.requireContact(context);
    for (const change of payload.priceChanges) {
      const { listingId, ...prices } = change;
      await this.listings.update(listingId, context.officeId, withoutNulls(prices));
    }
    await this.listingIntakes.confirm(payload.intakeId, context.officeId, context.userId, {
      result: payload.result,
      channel: 'phone',
      memo: payload.memo,
      contactId,
      checkedAt: context.recording.calledAt,
      callRecordingId: context.recording.id,
    });
    return { entityType: 'listing_intake', entityId: payload.intakeId };
  }
}

/** null을 빼서 "바꾸지 않음"으로 넘긴다 (생성·가격 변경용) */
function withoutNulls<T extends object>(value: T): { [K in keyof T]?: Exclude<T[K], null> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], null> };
}

/** 키 순서와 상관없이 같은 내용인지 비교하기 위한 JSON */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
