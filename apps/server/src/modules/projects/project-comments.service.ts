import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_COMMENT_LENGTH = 5_000;
/** 코멘트 한 쪽의 수. 오래된 코멘트는 쪽을 넘겨 끝까지 볼 수 있다. */
const DEFAULT_COMMENT_PAGE = 50;
const MAX_COMMENT_PAGE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 남이 적은 코멘트를 지울 수 있는 역할 */
const MODERATOR_ROLES = ['owner', 'manager'];

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

/**
 * 프로젝트에 적는 코멘트.
 *
 * 직원이 일에 대해 적어 두는 글이다. 손님과 나눈 대화는 상담(Consultation)에 적는다.
 * 고치는 것은 적은 사람만, 지우는 것은 적은 사람과 대표·관리자가 한다.
 */
@Injectable()
export class ProjectCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 최근 것부터 한 쪽을 주되, 쪽 안에서는 오래된 것이 위다.
   * before에 앞 쪽의 nextBefore를 주면 그보다 오래된 쪽을 준다. nextBefore가 null이면 더 없다.
   *
   * nextBefore는 그 쪽에서 가장 오래된 코멘트의 "적은 때|id"다. 코멘트를 다시 찾지 않고 이 값만으로
   * 이어 읽으므로, 그 코멘트가 그 사이에 지워져도 같은 값으로 다시 시도하면 이어진다.
   */
  async findAll(
    projectId: string,
    officeId: string,
    query: { before?: string; limit?: number } = {},
  ) {
    const limit = query.limit ?? DEFAULT_COMMENT_PAGE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COMMENT_PAGE) {
      throw new BadRequestException('limit 값이 올바르지 않습니다.');
    }
    const anchor =
      query.before === undefined ? null : this.parseCursor(query.before);
    await this.assertProject(officeId, projectId);
    const [total, page] = await Promise.all([
      this.prisma.projectComment.count({ where: { officeId, projectId } }),
      this.prisma.projectComment.findMany({
        where: {
          officeId,
          projectId,
          // 같은 시각에 적힌 코멘트가 빠지거나 겹치지 않게 id까지 견준다.
          ...(anchor
            ? {
                OR: [
                  { createdAt: { lt: anchor.createdAt } },
                  { createdAt: anchor.createdAt, id: { lt: anchor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // 하나 더 읽어 더 오래된 것이 남았는지 본다.
        take: limit + 1,
        select: commentSelect,
      }),
    ]);
    const items = page.slice(0, limit);
    const oldest = items[items.length - 1];
    return {
      total,
      nextBefore:
        page.length > limit && oldest
          ? `${oldest.createdAt.toISOString()}|${oldest.id}`
          : null,
      items: items.reverse(),
    };
  }

  async create(
    projectId: string,
    user: CurrentUserPayload,
    dto: { body?: string },
  ) {
    const body = this.normalizeBody(dto.body);
    await this.assertProject(user.officeId, projectId);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.projectComment.create({
        data: {
          officeId: user.officeId,
          projectId,
          authorId: user.userId,
          body,
        },
        select: commentSelect,
      });
      // 목록의 "최근 고친 순"에 코멘트도 반영한다.
      await tx.project.updateMany({
        where: { id: projectId, officeId: user.officeId },
        data: { updatedAt: new Date() },
      });
      return created;
    });
  }

  async update(
    projectId: string,
    commentId: string,
    user: CurrentUserPayload,
    dto: { body?: string },
  ) {
    const body = this.normalizeBody(dto.body);
    const comment = await this.findComment(user.officeId, projectId, commentId);
    if (comment.authorId !== user.userId) {
      throw new ForbiddenException('내가 적은 코멘트만 고칠 수 있습니다.');
    }
    return this.prisma.projectComment.update({
      where: { id: commentId },
      data: { body },
      select: commentSelect,
    });
  }

  async remove(projectId: string, commentId: string, user: CurrentUserPayload) {
    const comment = await this.findComment(user.officeId, projectId, commentId);
    if (
      comment.authorId !== user.userId &&
      !MODERATOR_ROLES.includes(user.role)
    ) {
      throw new ForbiddenException('내가 적은 코멘트만 지울 수 있습니다.');
    }
    await this.prisma.projectComment.deleteMany({
      where: { id: commentId, officeId: user.officeId, projectId },
    });
    return { success: true };
  }

  private async assertProject(officeId: string, projectId: string) {
    const found = await this.prisma.project.findFirst({
      where: { id: projectId, officeId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
  }

  private async findComment(
    officeId: string,
    projectId: string,
    commentId: string,
  ) {
    const comment = await this.prisma.projectComment.findFirst({
      where: { id: commentId, officeId, projectId },
      select: { id: true, authorId: true },
    });
    if (!comment) throw new NotFoundException('코멘트를 찾을 수 없습니다.');
    return comment;
  }

  private parseCursor(value: string) {
    const [at, id, ...rest] = value.split('|');
    const createdAt = new Date(at ?? '');
    if (
      rest.length > 0 ||
      !id ||
      !UUID_PATTERN.test(id) ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new BadRequestException('before 값이 올바르지 않습니다.');
    }
    return { createdAt, id };
  }

  private normalizeBody(value: unknown) {
    if (typeof value !== 'string') {
      throw new BadRequestException('코멘트 내용을 적어 주세요.');
    }
    const body = value.trim();
    if (!body) throw new BadRequestException('코멘트 내용을 적어 주세요.');
    if (body.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException(
        `코멘트는 ${MAX_COMMENT_LENGTH}자까지 적을 수 있습니다.`,
      );
    }
    return body;
  }
}
