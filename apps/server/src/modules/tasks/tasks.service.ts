import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly taskInclude = {
    assignedTo: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true } },
    assignedBy: { select: { id: true, name: true } },
    contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
    property: { include: { site: true, unit: true } },
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
  } as const;

  async findAll(
    officeId: string,
    query: {
      status?: string;
      category?: string;
      assignedToId?: string;
    } = {},
  ) {
    const tasks = await this.prisma.task.findMany({
      where: {
        officeId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.assignedToId
          ? { assignedToId: query.assignedToId }
          : {}),
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
    if (!task) throw new NotFoundException('Task not found');
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
      buyerReqId?: string;
      matchId?: string;
      dealId?: string;
      contractId?: string;
    },
    actorUserId?: string,
  ) {
    const task = await this.prisma.task.create({
      data: {
        officeId,
        title: dto.title,
        content: dto.content,
        source: dto.source ?? 'manual',
        status: dto.status ?? 'pending',
        priority: dto.priority ?? 'medium',
        category: dto.category ?? 'other',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedToId: dto.assignedToId,
        createdById: actorUserId,
        assignedById: dto.assignedToId ? actorUserId : undefined,
        assignedAt: dto.assignedToId ? new Date() : undefined,
        contactId: dto.contactId,
        propertyId: dto.propertyId,
        listingIntakeId: dto.listingIntakeId,
        listingId: dto.listingId,
        consultationId: dto.consultationId,
        buyerReqId: dto.buyerReqId,
        matchId: dto.matchId,
        dealId: dto.dealId,
        contractId: dto.contractId,
      },
      include: this.taskInclude,
    });

    await this.notifyAssigneeIfNeeded(
      officeId,
      task.id,
      task.title,
      task.assignedToId,
      actorUserId,
    );

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
      buyerReqId?: string | null;
      matchId?: string | null;
      dealId?: string | null;
      contractId?: string | null;
    },
    actorUserId?: string,
  ) {
    await this.findOne(id, officeId);

    const assignmentData = this.buildAssignmentUpdate(dto, actorUserId);
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        status: dto.status,
        priority: dto.priority,
        category: dto.category,
        dueDate: dto.dueDate === null ? null : dto.dueDate ? new Date(dto.dueDate) : undefined,
        ...assignmentData,
        contactId: dto.contactId,
        propertyId: dto.propertyId,
        listingIntakeId: dto.listingIntakeId,
        listingId: dto.listingId,
        consultationId: dto.consultationId,
        buyerReqId: dto.buyerReqId,
        matchId: dto.matchId,
        dealId: dto.dealId,
        contractId: dto.contractId,
      },
      include: this.taskInclude,
    });

    if ('assignedToId' in dto) {
      await this.notifyAssigneeIfNeeded(
        officeId,
        task.id,
        task.title,
        task.assignedToId,
        actorUserId,
      );
    }

    return task;
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
    return this.prisma.task.updateMany({
      where: { id: { in: ids }, officeId },
      data: { status },
    });
  }

  async bulkDelete(ids: string[], officeId: string) {
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

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.task.delete({ where: { id } });
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

  private async notifyAssigneeIfNeeded(
    officeId: string,
    taskId: string,
    title: string,
    assignedToId?: string | null,
    actorUserId?: string,
  ) {
    if (!assignedToId || assignedToId === actorUserId) {
      return;
    }

    await this.prisma.notification.create({
      data: {
        officeId,
        userId: assignedToId,
        type: 'task_assigned',
        title: '새 업무가 배정되었습니다',
        content: title,
        linkType: 'task',
        linkId: taskId,
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
