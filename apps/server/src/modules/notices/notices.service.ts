import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 공지사항. 에스테잇플로우가 모든 사용자에게 알리는 공지다 (사무소 공지가 아니다).
 *
 * - 직원: 지금 게시 중인 공지를 보고, 읽었다고 표시한다. 사무소와 상관없이 같은 목록이다.
 * - 운영자(User.isPlatformAdmin): 올리고 고치고 내린다. 앱에는 화면이 없고 이 API만 있다.
 */

const TITLE_MAX = 120;
const BODY_MAX = 20_000;
/** 직원에게 내려 주는 최근 공지 수. 대시보드와 본문 창이 이 목록 하나를 쓴다. */
const LIST_LIMIT = 30;
/**
 * 안 읽은 공지는 최근 목록에서 밀려났더라도 함께 내려 준다. 그러지 않으면 오래된 안 읽은 필독이
 * 목록에 없는데 '안 읽음' 수에는 잡혀, 읽을 방법이 없는 숫자가 남는다.
 * 한 번에 내려 주는 양에는 상한을 둔다 (오래 쓰지 않던 계정은 수백 건이 쌓여 있을 수 있다).
 */
const UNREAD_LIMIT = 200;

export interface NoticeInput {
  title?: unknown;
  body?: unknown;
  isRequired?: unknown;
  publishedAt?: unknown;
  expiresAt?: unknown;
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${label}은(는) 날짜 문자열이어야 합니다.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label}의 날짜 형식이 올바르지 않습니다.`);
  }
  return date;
}

function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('제목을 입력해 주세요.');
  }
  const title = value.trim();
  if (title.length > TITLE_MAX) {
    throw new BadRequestException(`제목은 ${TITLE_MAX}자까지 쓸 수 있습니다.`);
  }
  return title;
}

function parseBody(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('본문을 입력해 주세요.');
  }
  const body = value.trim();
  if (body.length > BODY_MAX) {
    throw new BadRequestException(`본문은 ${BODY_MAX.toLocaleString('ko-KR')}자까지 쓸 수 있습니다.`);
  }
  return body;
}

function parseRequired(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException('필독 여부는 true 또는 false여야 합니다.');
  }
  return value;
}

function assertPeriod(publishedAt: Date, expiresAt: Date | null) {
  if (expiresAt && expiresAt.getTime() <= publishedAt.getTime()) {
    throw new BadRequestException('게시 종료는 게시 시작보다 뒤여야 합니다.');
  }
}

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  /* ───────── 직원 ───────── */

  /** 지금 게시 중인 공지. 안 읽은 필독이 먼저, 그다음 최근 것부터. */
  async listForUser(userId: string, now = new Date()) {
    const visible: Prisma.NoticeWhereInput = {
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const select = {
      id: true,
      title: true,
      body: true,
      isRequired: true,
      publishedAt: true,
      reads: { where: { userId }, select: { readAt: true } },
    } satisfies Prisma.NoticeSelect;
    const orderBy: Prisma.NoticeOrderByWithRelationInput[] = [{ publishedAt: 'desc' }, { id: 'desc' }];
    const unreadWhere: Prisma.NoticeWhereInput = { ...visible, reads: { none: { userId } } };
    const [recent, unread, unreadCount] = await Promise.all([
      this.prisma.notice.findMany({ where: visible, orderBy, take: LIST_LIMIT, select }),
      this.prisma.notice.findMany({ where: unreadWhere, orderBy, take: UNREAD_LIMIT, select }),
      // 안 읽은 공지가 UNREAD_LIMIT 보다 많으면 목록에 다 담기지 않는다. 수는 전부 센 값을 준다.
      // 목록의 안 읽은 줄을 다 읽고도 이 수가 남으면 화면이 목록을 다시 불러 나머지를 받는다.
      this.prisma.notice.count({ where: unreadWhere }),
    ]);
    const byId = new Map([...recent, ...unread].map((row) => [row.id, row]));
    const items = [...byId.values()]
      .map(({ reads, ...notice }) => ({ ...notice, readAt: reads[0]?.readAt ?? null }))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? 1 : -1));
    const pinned = (item: (typeof items)[number]) => (item.isRequired && !item.readAt ? 0 : 1);
    // sort 는 순서가 같은 것끼리의 앞뒤를 지키므로, 안 읽은 필독만 앞으로 오고 나머지는 최근순 그대로다
    items.sort((a, b) => pinned(a) - pinned(b));
    return { items, unreadCount };
  }

  /**
   * 읽었다고 표시한다. 여러 번 불러도 처음 읽은 시각이 남는다.
   * 아직 게시 전이거나 내린 공지는 없는 것으로 답한다 (예약 공지의 존재를 알리지 않는다).
   */
  async markRead(noticeId: string, userId: string, now = new Date()) {
    const notice = await this.prisma.notice.findFirst({
      where: {
        id: noticeId,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    if (!notice) throw new NotFoundException('공지를 찾을 수 없습니다.');
    // 같은 공지를 동시에 두 번 읽어도(두 창, 연달아 누르기) 한쪽이 중복 오류로 실패하지 않게 한다.
    // 이미 있으면 넣지 않으므로 처음 읽은 시각이 남는다.
    await this.prisma.noticeRead.createMany({
      data: [{ noticeId, userId, readAt: now }],
      skipDuplicates: true,
    });
    const read = await this.prisma.noticeRead.findUnique({
      where: { noticeId_userId: { noticeId, userId } },
      select: { readAt: true },
    });
    return { noticeId, readAt: read?.readAt ?? now };
  }

  /* ───────── 운영자 ───────── */

  /** 요청마다 DB에서 확인한다. 토큰에 든 값은 믿지 않는다 (권한을 거둔 뒤에도 토큰은 남는다). */
  private async assertPlatformAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true, isActive: true },
    });
    if (!user?.isPlatformAdmin || !user.isActive) {
      throw new ForbiddenException('공지사항은 운영자만 관리할 수 있습니다.');
    }
  }

  /** 예약·종료된 것까지 전부. 읽은 사람 수를 함께 준다. */
  async adminList(userId: string) {
    await this.assertPlatformAdmin(userId);
    const rows = await this.prisma.notice.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { reads: true } } },
    });
    return rows.map(({ _count, ...notice }) => ({ ...notice, readCount: _count.reads }));
  }

  async create(userId: string, input: NoticeInput) {
    await this.assertPlatformAdmin(userId);
    const publishedAt = input.publishedAt == null ? new Date() : parseDate(input.publishedAt, '게시 시작');
    const expiresAt = input.expiresAt == null ? null : parseDate(input.expiresAt, '게시 종료');
    assertPeriod(publishedAt, expiresAt);
    return this.prisma.notice.create({
      data: {
        title: parseTitle(input.title),
        body: parseBody(input.body),
        isRequired: input.isRequired == null ? false : parseRequired(input.isRequired),
        publishedAt,
        expiresAt,
        createdById: userId,
      },
    });
  }

  /** 보낸 칸만 고친다. expiresAt 에 null 을 보내면 종료일을 없앤다. */
  async update(id: string, userId: string, input: NoticeInput) {
    await this.assertPlatformAdmin(userId);
    const current = await this.prisma.notice.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('공지를 찾을 수 없습니다.');
    if (input.publishedAt === null) throw new BadRequestException('게시 시작은 비울 수 없습니다.');
    const publishedAt = input.publishedAt === undefined ? current.publishedAt : parseDate(input.publishedAt, '게시 시작');
    const expiresAt =
      input.expiresAt === undefined ? current.expiresAt : input.expiresAt === null ? null : parseDate(input.expiresAt, '게시 종료');
    assertPeriod(publishedAt, expiresAt);
    return this.prisma.notice.update({
      where: { id },
      data: {
        title: input.title === undefined ? undefined : parseTitle(input.title),
        body: input.body === undefined ? undefined : parseBody(input.body),
        isRequired: input.isRequired === undefined ? undefined : parseRequired(input.isRequired),
        publishedAt,
        expiresAt,
      },
    });
  }

  /** 지운다. 읽음 기록도 함께 사라진다. 기록을 남기려면 지우지 말고 게시 종료를 넣는다. */
  async remove(id: string, userId: string) {
    await this.assertPlatformAdmin(userId);
    const { count } = await this.prisma.notice.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundException('공지를 찾을 수 없습니다.');
    return { id };
  }
}
