import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    return this.prisma.task.findMany({
      where: { officeId },
      orderBy: [{ isDone: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, officeId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, officeId },
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
      dueDate?: string;
    },
  ) {
    return this.prisma.task.create({
      data: {
        officeId,
        title: dto.title,
        content: dto.content,
        source: dto.source ?? 'manual',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      title?: string;
      content?: string;
      isDone?: boolean;
      dueDate?: string;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.task.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.task.delete({ where: { id } });
  }
}
