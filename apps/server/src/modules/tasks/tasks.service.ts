import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TASK_LINK_FIELDS,
  assertLinksInOffice,
  assertStaffInOffice,
  isActiveStaffInOffice,
  isUuid,
  parseDateInput,
} from './linked-records';
import {
  contactPhonesSelectOrdered,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from '../buyer-requirements/buyer-requirement.presenter';

const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
const TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const TASK_CATEGORIES = [
  'property',
  'buyer',
  'match',
  'deal',
  'contract',
  'consultation',
  'viewing',
  'admin',
  'other',
  'advertisement',
  'call',
  'document',
  'verify',
];
const TASK_SOURCES = ['manual', 'system', 'ai'];
const TITLE_MAX = 200;

type TaskInput = {
  title?: unknown;
  content?: unknown;
  source?: unknown;
  status?: unknown;
  priority?: unknown;
  category?: unknown;
  dueDate?: unknown;
  assignedToId?: unknown;
};

function assertOneOf(value: unknown, allowed: string[], message: string) {
  if (value === undefined) return;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new BadRequestException(message);
  }
}

function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('업무 제목을 입력해 주세요.');
  }
  const title = value.trim();
  if (title.length > TITLE_MAX) {
    throw new BadRequestException(`업무 제목은 ${TITLE_MAX}자까지 쓸 수 있습니다.`);
  }
  return title;
}

/** 설명: 보내지 않으면 그대로, 빈 글이면 지운다 */
function parseContent(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException('업무 설명 형식이 올바르지 않습니다.');
  return value.trim() || null;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** 보낸 칸만 검사한다. 연결 대상과 담당자는 같은 사무소의 것이어야 한다. */
  private async validateInput(
    officeId: string,
    dto: TaskInput & Record<string, unknown>,
    db: unknown = this.prisma,
  ) {
    assertOneOf(dto.status, TASK_STATUSES, '업무 상태 값이 올바르지 않습니다.');
    assertOneOf(dto.priority, TASK_PRIORITIES, '우선순위 값이 올바르지 않습니다.');
    assertOneOf(dto.category, TASK_CATEGORIES, '업무 종류 값이 올바르지 않습니다.');
    assertOneOf(dto.source, TASK_SOURCES, '업무 출처 값이 올바르지 않습니다.');
    parseDateInput(dto.dueDate, '마감일');
    await Promise.all([
      dto.assignedToId ? assertStaffInOffice(db, officeId, dto.assignedToId) : undefined,
      assertLinksInOffice(db, officeId, dto, TASK_LINK_FIELDS),
    ]);
  }

  private readonly taskInclude = {
    project: { select: { id: true, title: true, archivedAt: true } },
    assignedTo: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true } },
    assignedBy: { select: { id: true, name: true } },
    contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
    property: {
      include: {
        site: true,
        unit: {
          include: {
            dong: { select: { id: true, name: true, isPlaceholder: true } },
          },
        },
        // 가장 최근 의뢰 하나 — 매물이 팔린(의뢰가 끝난) 뒤에도 남은 업무를 화면이 알아보게 한다.
        // 업무를 알아서 닫지는 않는다.
        listingIntakes: {
          select: { id: true, lifecycleStatus: true, closedReason: true },
          orderBy: { receivedAt: 'desc' },
          take: 1,
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
      include: {
        intake: { select: LISTING_INTAKE_STATE_SELECT },
        deals: OCCUPYING_DEALS_SELECT,
      },
    },
    consultation: true,
    buyerIntake: {
      select: {
        id: true,
        lifecycleStatus: true,
        receivedAt: true,
      },
    },
    buyerRequirement: {
      select: {
        id: true,
        status: true,
        buyerIntake: {
          include: { contacts: buyerIntakeContactsInclude },
        },
      },
    },
    match: { select: { id: true, stage: true, listingId: true, buyerReqId: true } },
    deal: {
      select: {
        id: true,
        stage: true,
        isCancelled: true,
        transactionType: true,
        listingId: true,
        matchId: true,
        buyerContactId: true,
        sellerContactId: true,
      },
    },
    contract: {
      select: {
        id: true,
        status: true,
        dealId: true,
        contractDate: true,
        moveInDate: true,
      },
    },
    advertisementChangeRequests: {
      select: {
        id: true,
        advertisementId: true,
        listingId: true,
        channel: true,
        cpAccountId: true,
        action: true,
        status: true,
        targetValue: true,
        baseSnapshot: true,
        failureReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  } as const;

  async findAll(
    officeId: string,
    query: {
      status?: string;
      category?: string;
      assignedToId?: string;
      /** 이 프로젝트에 적은 업무만 */
      projectId?: string;
    } = {},
  ) {
    // 형식이 틀린 id로는 아무것도 찾지 않는다(DB의 uuid 변환 오류를 500으로 내지 않는다).
    if (query.projectId !== undefined && !isUuid(query.projectId)) return [];
    if (query.assignedToId !== undefined && !isUuid(query.assignedToId)) return [];
    const tasks = await this.prisma.task.findMany({
      where: {
        officeId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.assignedToId
          ? { assignedToId: query.assignedToId }
          : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      include: this.taskInclude,
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return tasks.map((task) => this.withContactPhones(task));
  }

  async findOne(id: string, officeId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, officeId },
      include: this.taskInclude,
    });
    if (!task) throw new NotFoundException('업무를 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
    return this.withContactPhones(task);
  }

  async create(
    officeId: string,
    dto: {
      title: string;
      content?: string;
      source?: string;
      status?: string;
      priority?: string;
      category?: string;
      dueDate?: string;
      assignedToId?: string;
      contactId?: string;
      propertyId?: string;
      listingIntakeId?: string;
      listingId?: string;
      consultationId?: string;
      buyerIntakeId?: string;
      buyerReqId?: string;
      matchId?: string;
      dealId?: string;
      contractId?: string;
      projectId?: string;
    },
    actorUserId?: string,
    /**
     * id: 같은 요청을 다시 보내도 한 건만 생기게 할 때 (통화 분석 제안 반영)
     * dropUnavailableAssignee: 사람이 고른 담당이 아니라 시스템이 정한 담당(녹음한 직원 등)일 때.
     *   그 직원이 퇴사·차단돼 담당을 맡을 수 없으면 400 대신 '미배정'으로 만든다(사무소 전체에서 보인다).
     *   사람이 고른 담당은 지금처럼 일하는 직원만 받는다.
     * tx: 호출자가 연 트랜잭션 안에서 업무를 함께 만들 때. 이때 알림은 skipNotification과
     *   함께 트랜잭션 커밋 뒤 notifyAssigneeIfNeeded로 보낼 수 있다.
     */
    options: {
      id?: string;
      dropUnavailableAssignee?: boolean;
      tx?: Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
      skipNotification?: boolean;
    } = {},
  ) {
    const db = options.tx ?? this.prisma;
    const title = parseTitle(dto.title);
    if (
      options.dropUnavailableAssignee &&
      dto.assignedToId &&
      !(await isActiveStaffInOffice(db, officeId, dto.assignedToId))
    ) {
      dto = { ...dto, assignedToId: undefined };
    }
    await this.validateInput(officeId, dto, db);
    const task = await db.task.create({
      data: {
        ...(options.id ? { id: options.id } : {}),
        officeId,
        title,
        content: parseContent(dto.content) ?? undefined,
        source: dto.source ?? 'manual',
        status: dto.status ?? 'pending',
        priority: dto.priority ?? 'medium',
        category: dto.category ?? 'other',
        dueDate: parseDateInput(dto.dueDate, '마감일'),
        assignedToId: dto.assignedToId || undefined,
        createdById: actorUserId,
        assignedById: dto.assignedToId ? actorUserId : undefined,
        assignedAt: dto.assignedToId ? new Date() : undefined,
        contactId: dto.contactId || undefined,
        propertyId: dto.propertyId || undefined,
        listingIntakeId: dto.listingIntakeId || undefined,
        listingId: dto.listingId || undefined,
        consultationId: dto.consultationId || undefined,
        buyerIntakeId: dto.buyerIntakeId || undefined,
        buyerReqId: dto.buyerReqId || undefined,
        matchId: dto.matchId || undefined,
        dealId: dto.dealId || undefined,
        contractId: dto.contractId || undefined,
        projectId: dto.projectId || undefined,
      },
      include: this.taskInclude,
    });

    if (!options.skipNotification) {
      await this.notifyAssigneeIfNeeded(
        officeId,
        task.id,
        task.title,
        task.assignedToId,
        actorUserId,
      );
    }

    return this.withContactPhones(task);
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      title?: string;
      content?: string;
      status?: string;
      priority?: string;
      category?: string;
      dueDate?: string | null;
      assignedToId?: string | null;
      contactId?: string | null;
      propertyId?: string | null;
      listingIntakeId?: string | null;
      listingId?: string | null;
      consultationId?: string | null;
      buyerIntakeId?: string | null;
      buyerReqId?: string | null;
      matchId?: string | null;
      dealId?: string | null;
      contractId?: string | null;
      projectId?: string | null;
    },
    actorUserId?: string,
  ) {
    const current = await this.findOne(id, officeId);
    const title = dto.title === undefined ? undefined : parseTitle(dto.title);
    await this.validateInput(officeId, dto);

    // 수정 창은 담당자를 늘 함께 보낸다. 담당자가 그대로면 배정 기록을 새로 찍거나 알림을 다시 보내지 않는다.
    const assigneeChanged =
      'assignedToId' in dto && (dto.assignedToId || null) !== (current.assignedToId ?? null);
    const assignmentData = assigneeChanged ? this.buildAssignmentUpdate(dto, actorUserId) : {};
    const link = (value: string | null | undefined) => (value === '' ? null : value);
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        title,
        content: parseContent(dto.content),
        status: dto.status,
        priority: dto.priority,
        category: dto.category,
        dueDate: dto.dueDate === null || dto.dueDate === '' ? null : parseDateInput(dto.dueDate, '마감일'),
        ...assignmentData,
        contactId: link(dto.contactId),
        propertyId: link(dto.propertyId),
        listingIntakeId: link(dto.listingIntakeId),
        listingId: link(dto.listingId),
        consultationId: link(dto.consultationId),
        buyerIntakeId: link(dto.buyerIntakeId),
        buyerReqId: link(dto.buyerReqId),
        matchId: link(dto.matchId),
        dealId: link(dto.dealId),
        contractId: link(dto.contractId),
        projectId: link(dto.projectId),
      },
      include: this.taskInclude,
    });

    if (assigneeChanged) {
      await this.notifyAssigneeIfNeeded(
        officeId,
        task.id,
        task.title,
        task.assignedToId,
        actorUserId,
      );
    }

    return this.withContactPhones(task);
  }

  /**
   * 외부 Agent가 Task를 실행하기 직전에 한 번만 호출하는 원자적 claim.
   * 세부 실행 단계는 로컬 Skill이 소유하며 서버에는 일반 Task 상태만 남긴다.
   */
  async claim(id: string, officeId: string, actorUserId: string) {
    const current = await this.findOne(id, officeId);
    if (current.status !== 'pending') {
      throw new ConflictException('대기 중인 업무만 시작할 수 있습니다.');
    }
    if (current.assignedToId && current.assignedToId !== actorUserId) {
      throw new ConflictException('다른 담당자에게 배정된 업무입니다.');
    }

    const claimed = await this.prisma.task.updateMany({
      where: {
        id,
        officeId,
        status: 'pending',
        OR: [{ assignedToId: null }, { assignedToId: actorUserId }],
      },
      data: {
        status: 'in_progress',
        assignedToId: current.assignedToId ?? actorUserId,
        assignedById: current.assignedToId
          ? current.assignedById
          : actorUserId,
        assignedAt: current.assignedToId
          ? current.assignedAt
          : new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('이미 다른 실행자가 시작한 업무입니다.');
    }

    return this.findOne(id, officeId);
  }

  async bulkUpdateStatus(ids: string[], officeId: string, status: string) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('바꿀 업무를 골라 주세요.');
    }
    assertOneOf(status, TASK_STATUSES, '업무 상태 값이 올바르지 않습니다.');
    return this.prisma.task.updateMany({
      where: { id: { in: ids }, officeId },
      data: { status },
    });
  }

  /** 여러 건 지우기는 대표·매니저만 한다 (화면도 직원에게는 단추를 숨긴다). */
  async bulkDelete(ids: string[], officeId: string, role?: string) {
    if (role === 'agent') {
      throw new ForbiddenException('여러 업무를 한꺼번에 지우는 일은 대표·매니저만 할 수 있습니다.');
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('지울 업무를 골라 주세요.');
    }
    return this.prisma.task.deleteMany({
      where: { id: { in: ids }, officeId },
    });
  }

  async reorder(officeId: string, orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.task.updateMany({
        where: { id, officeId },
        data: { sortOrder: index },
      }),
    );
    await this.prisma.$transaction(updates);
    return { count: orderedIds.length };
  }

  /** 시스템·AI가 만든 업무는 직원이 지우지 못한다 (화면과 같은 규칙). */
  async remove(id: string, officeId: string, role?: string) {
    const task = await this.findOne(id, officeId);
    const manualOnly = role === 'agent';
    if (manualOnly && task.source !== 'manual') {
      throw new ForbiddenException('시스템·AI가 만든 업무는 대표·매니저만 지울 수 있습니다.');
    }
    // 출처(source)는 수정으로 바꿀 수 없다(update가 받지 않는다). 지우는 순간에도 같은 조건으로 지운다.
    const { count } = await this.prisma.task.deleteMany({
      where: { id, officeId, ...(manualOnly ? { source: 'manual' } : {}) },
    });
    if (count === 0) throw new NotFoundException('업무를 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
    return task;
  }

  private buildAssignmentUpdate(
    dto: { assignedToId?: string | null },
    actorUserId?: string,
  ) {
    if (!('assignedToId' in dto)) {
      return {};
    }

    if (!dto.assignedToId) {
      return {
        assignedToId: null,
        assignedById: null,
        assignedAt: null,
      };
    }

    return {
      assignedToId: dto.assignedToId,
      assignedById: actorUserId ?? null,
      assignedAt: new Date(),
    };
  }

  async notifyAssigneeIfNeeded(
    officeId: string,
    taskId: string,
    title: string,
    assignedToId?: string | null,
    actorUserId?: string,
  ) {
    if (!assignedToId || assignedToId === actorUserId) {
      return;
    }

    const input = {
      officeId,
      userIds: [assignedToId],
      type: 'task_assigned',
      title: '새 업무가 배정되었습니다',
      content: title,
      linkType: 'task',
      linkId: taskId,
    };
    // 알림 서비스로 만들어야 받는 사람의 종 모양 알림에 바로(실시간) 뜬다.
    if (this.notifications) {
      await this.notifications.notify(input);
      return;
    }
    await this.prisma.notification.create({
      data: {
        officeId,
        userId: assignedToId,
        type: input.type,
        title: input.title,
        content: input.content,
        linkType: input.linkType,
        linkId: input.linkId,
      },
    });
  }

  private withContactPhones<T>(task: T): T {
    const draft = task as Record<string, unknown>;
    const contact = draft.contact as ({ phones?: [] } & Record<string, unknown>) | null | undefined;
    if (contact) {
      draft.contact = withPrimaryPhone(contact);
    }

    const buyerRequirement = draft.buyerRequirement as any;
    if (buyerRequirement?.buyerIntake?.contacts) {
      draft.buyerRequirement = withBuyerRequirementContact(buyerRequirement);
    }

    return task;
  }
}
