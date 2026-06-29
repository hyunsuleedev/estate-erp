import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface ListActivityLogsOptions {
  entityType?: string;
  entityId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(officeId: string, options: ListActivityLogsOptions = {}) {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(options.page ?? 1, 1);

    const where = {
      officeId,
      ...(options.entityType ? { entityType: options.entityType } : {}),
      ...(options.entityId ? { entityId: options.entityId } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }
}
