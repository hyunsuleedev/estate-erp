import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly taskInclude = {
    assignedTo: { select: { id: true, name: true } },
    contact: { select: { id: true, name: true, phone: true } },
    property: { include: { site: true, unit: true } },
    listing: true,
    consultation: true,
  } as const;

  async findAll(officeId: string) {
    return this.prisma.task.findMany({
      where: { officeId },
      include: this.taskInclude,
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, officeId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, officeId },
      include: this.taskInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
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
      listingId?: string;
      consultationId?: string;
    },
  ) {
    return this.prisma.task.create({
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
        contactId: dto.contactId,
        propertyId: dto.propertyId,
        listingId: dto.listingId,
        consultationId: dto.consultationId,
      },
      include: this.taskInclude,
    });
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
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        status: dto.status,
        priority: dto.priority,
        category: dto.category,
        dueDate: dto.dueDate === null ? null : dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedToId: dto.assignedToId,
      },
      include: this.taskInclude,
    });
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
}
