import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_COMMENT_PAGE = 30;
const MAX_COMMENT_PAGE = 100;
const MAX_COMMENT_BODY_LENGTH = 5000;
const MODERATOR_ROLES = ['owner', 'manager'];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CommentTarget {
  projectId?: string;
  propertyId?: string;
  listingIntakeId?: string;
  buyerIntakeId?: string;
  dealId?: string;
}

type TargetKey = keyof CommentTarget;

const COMMENT_TARGETS: ReadonlyArray<{
  key: TargetKey;
  notFoundMessage: string;
  exists: (
    prisma: PrismaService,
    officeId: string,
    id: string,
  ) => Promise<{ id: string } | null>;
}> = [
  {
    key: 'projectId',
    notFoundMessage: '프로젝트를 찾을 수 없습니다.',
    exists: (prisma, officeId, id) =>
      prisma.project.findFirst({ where: { officeId, id }, select: { id: true } }),
  },
  {
    key: 'propertyId',
    notFoundMessage: '매물을 찾을 수 없습니다.',
    exists: (prisma, officeId, id) =>
      prisma.property.findFirst({ where: { officeId, id }, select: { id: true } }),
  },
  {
    key: 'listingIntakeId',
    notFoundMessage: '매물 의뢰를 찾을 수 없습니다.',
    exists: (prisma, officeId, id) =>
      prisma.listingIntake.findFirst({ where: { officeId, id }, select: { id: true } }),
  },
  {
    key: 'buyerIntakeId',
    notFoundMessage: '구매 의뢰를 찾을 수 없습니다.',
    exists: (prisma, officeId, id) =>
      prisma.buyerIntake.findFirst({ where: { officeId, id }, select: { id: true } }),
  },
  {
    key: 'dealId',
    notFoundMessage: '거래를 찾을 수 없습니다.',
    exists: (prisma, officeId, id) =>
      prisma.deal.findFirst({ where: { officeId, id }, select: { id: true } }),
  },
];

const commentSelect = {
  id: true,
  body: true,
  projectId: true,
  propertyId: true,
  listingIntakeId: true,
  buyerIntakeId: true,
  dealId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

interface ResolvedTarget {
  key: TargetKey;
  id: string;
  notFoundMessage: string;
  exists: (
    prisma: PrismaService,
    officeId: string,
    id: string,
  ) => Promise<{ id: string } | null>;
}

/**
 * 직원이 일(프로젝트·관리 공간·매물 의뢰·구매 의뢰·거래)에 적어 두는 코멘트 서비스.
 * 다섯 축 중 정확히 하나만 가리킨다(DB CHECK와 서비스 검증이 같은 기준을 지킨다).
 */
@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 최근 것부터 한 쪽을 돌려준다.
   * before에 앞 쪽의 nextBefore를 주면 그보다 오래된 쪽을 준다. nextBefore가 null이면 더 없다.
   */
  async findAll(
    target: CommentTarget,
    officeId: string,
    query: { before?: string; limit?: number } = {},
  ) {
    const resolved = await this.assertTarget(target, officeId);

    const limit = query.limit ?? DEFAULT_COMMENT_PAGE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COMMENT_PAGE) {
      throw new BadRequestException('limit 값이 올바르지 않습니다.');
    }

    const cursor = query.before === undefined ? null : this.parseCursor(query.before);
    const baseWhere: Prisma.CommentWhereInput = {
      officeId,
      [resolved.key]: resolved.id,
    };
    const where: Prisma.CommentWhereInput = cursor
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : baseWhere;

    const [total, page] = await Promise.all([
      this.prisma.comment.count({ where: baseWhere }),
      this.prisma.comment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: commentSelect,
      }),
    ]);

    const items = page.slice(0, limit);
    const oldest = items[items.length - 1];
    const nextBefore =
      page.length > limit && oldest
        ? `${oldest.createdAt.toISOString()}|${oldest.id}`
        : null;

    return { total, nextBefore, items };
  }

  async create(
    target: CommentTarget,
    user: CurrentUserPayload,
    dto: { body?: string },
  ) {
    const resolved = await this.assertTarget(target, user.officeId);
    const body = this.normalizeBody(dto.body);

    return this.prisma.comment.create({
      data: {
        officeId: user.officeId,
        [resolved.key]: resolved.id,
        authorId: user.userId,
        body,
      },
      select: commentSelect,
    });
  }

  async update(
    commentId: string,
    user: CurrentUserPayload,
    dto: { body?: string },
  ) {
    const comment = await this.findComment(commentId, user.officeId);
    if (comment.authorId !== user.userId) {
      throw new ForbiddenException('내가 적은 코멘트만 고칠 수 있습니다.');
    }
    const body = this.normalizeBody(dto.body);

    return this.prisma.comment.update({
      where: { id: comment.id },
      data: { body },
      select: commentSelect,
    });
  }

  async remove(commentId: string, user: CurrentUserPayload) {
    const comment = await this.findComment(commentId, user.officeId);
    if (
      comment.authorId !== user.userId &&
      !MODERATOR_ROLES.includes(user.role)
    ) {
      throw new ForbiddenException('내가 적은 코멘트만 지울 수 있습니다.');
    }

    await this.prisma.comment.delete({ where: { id: comment.id } });
    return { success: true };
  }

  private resolveTarget(target: CommentTarget): ResolvedTarget {
    const matches = COMMENT_TARGETS.flatMap((spec) => {
      const value = target[spec.key];
      return value !== undefined ? [{ spec, value }] : [];
    });

    if (matches.length !== 1) {
      throw new BadRequestException('코멘트를 달 대상 하나만 지정해 주세요.');
    }

    const [{ spec, value }] = matches;
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException('코멘트 대상 ID가 올바르지 않습니다.');
    }

    return {
      key: spec.key,
      id: value,
      notFoundMessage: spec.notFoundMessage,
      exists: spec.exists,
    };
  }

  private async assertTarget(target: CommentTarget, officeId: string) {
    const resolved = this.resolveTarget(target);
    const found = await resolved.exists(this.prisma, officeId, resolved.id);
    if (!found) {
      throw new NotFoundException(resolved.notFoundMessage);
    }
    return resolved;
  }

  private async findComment(commentId: string, officeId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { officeId, id: commentId },
      select: { id: true, authorId: true },
    });
    if (!comment) throw new NotFoundException('코멘트를 찾을 수 없습니다.');
    return comment;
  }

  private parseCursor(raw: string): { createdAt: Date; id: string } {
    const parts = raw.split('|');
    if (parts.length !== 2) {
      throw new BadRequestException('before 값이 올바르지 않습니다.');
    }
    const [timestamp, id] = parts;
    const createdAt = new Date(timestamp);
    if (Number.isNaN(createdAt.getTime()) || !UUID_PATTERN.test(id)) {
      throw new BadRequestException('before 값이 올바르지 않습니다.');
    }
    return { createdAt, id };
  }

  private normalizeBody(raw?: string): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException('코멘트 내용을 적어 주세요.');
    }
    const body = raw.trim();
    if (!body) throw new BadRequestException('코멘트 내용을 적어 주세요.');
    if (body.length > MAX_COMMENT_BODY_LENGTH) {
      throw new BadRequestException(
        `코멘트는 ${MAX_COMMENT_BODY_LENGTH}자까지 적을 수 있습니다.`,
      );
    }
    return body;
  }
}
