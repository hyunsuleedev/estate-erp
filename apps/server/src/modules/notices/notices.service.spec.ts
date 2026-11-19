import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NoticesService } from './notices.service';

const NOW = new Date('2026-11-19T03:00:00Z');

function setup(admin = true) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ isPlatformAdmin: admin, isActive: true }) },
    notice: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'n1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'n1', ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    noticeRead: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ readAt: NOW }),
    },
  };
  return { prisma, service: new NoticesService(prisma as never) };
}

describe('NoticesService', () => {
  describe('직원', () => {
    it('게시 중인 공지만 묻고, 사무소로 좁히지 않는다', async () => {
      const { prisma, service } = setup();
      await service.listForUser('u1', NOW);
      const where = prisma.notice.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ publishedAt: { lte: NOW }, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] });
      expect(JSON.stringify(where)).not.toContain('officeId');
      // 읽음 여부는 본인 것만 붙인다
      expect(prisma.notice.findMany.mock.calls[0][0].select.reads).toEqual({ where: { userId: 'u1' }, select: { readAt: true } });
    });

    it('최근 목록에서 밀려난 안 읽은 공지도 함께 내려 주고, 안 읽음 수는 목록과 맞는다', async () => {
      const { prisma, service } = setup();
      const row = (id: string, day: number, isRequired: boolean, read: boolean) => ({
        id, title: id, body: '', isRequired, publishedAt: new Date(Date.UTC(2026, 10, day)), reads: read ? [{ readAt: NOW }] : [],
      });
      prisma.notice.findMany
        .mockResolvedValueOnce([row('new', 18, false, true), row('mid', 10, false, false)]) // 최근 목록
        .mockResolvedValueOnce([row('mid', 10, false, false), row('old-required', 1, true, false)]); // 안 읽은 것
      const result = await service.listForUser('u1', NOW);
      expect(prisma.notice.findMany.mock.calls[1][0].where.reads).toEqual({ none: { userId: 'u1' } });
      // 겹치는 것은 한 번만, 안 읽은 필독이 맨 앞
      expect(result.items.map((item) => item.id)).toEqual(['old-required', 'new', 'mid']);
    });

    it('안 읽음 수는 목록에 담긴 것이 아니라 전부를 센다', async () => {
      const { prisma, service } = setup();
      // 안 읽은 공지가 상한보다 많아 목록에는 일부만 담겼다
      prisma.notice.count.mockResolvedValue(250);
      const result = await service.listForUser('u1', NOW);
      expect(prisma.notice.count.mock.calls[0][0].where).toMatchObject({ reads: { none: { userId: 'u1' } }, publishedAt: { lte: NOW } });
      expect(result.unreadCount).toBe(250);
    });

    it('안 읽은 필독을 앞에 두고 나머지는 최근순 그대로 둔다', async () => {
      const { prisma, service } = setup();
      // a 가 가장 최근, d 가 가장 오래됨
      const row = (id: string, day: number, isRequired: boolean, read: boolean) => ({
        id, title: id, body: '', isRequired, publishedAt: new Date(Date.UTC(2026, 10, day)), reads: read ? [{ readAt: NOW }] : [],
      });
      prisma.notice.findMany
        .mockResolvedValueOnce([row('a', 18, false, false), row('b', 17, true, true), row('c', 16, true, false), row('d', 15, false, true)])
        .mockResolvedValueOnce([row('a', 18, false, false), row('c', 16, true, false)]);
      prisma.notice.count.mockResolvedValue(2);
      const result = await service.listForUser('u1', NOW);
      expect(result.items.map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
      expect(result.items[0]).toMatchObject({ readAt: null });
      expect(result.items[2]).toMatchObject({ readAt: NOW });
      expect(result.unreadCount).toBe(2);
    });

    it('읽음 표시는 처음 읽은 시각을 덮어쓰지 않는다', async () => {
      const { prisma, service } = setup();
      prisma.notice.findFirst.mockResolvedValue({ id: 'n1' });
      await service.markRead('n1', 'u1', NOW);
      // 이미 있으면 넣지 않는다 (동시에 두 번 읽어도 중복 오류가 나지 않는다)
      expect(prisma.noticeRead.createMany).toHaveBeenCalledWith({
        data: [{ noticeId: 'n1', userId: 'u1', readAt: NOW }],
        skipDuplicates: true,
      });
    });

    it('아직 게시 전이거나 내린 공지는 읽음 표시를 받지 않는다', async () => {
      const { prisma, service } = setup();
      prisma.notice.findFirst.mockResolvedValue(null);
      await expect(service.markRead('n1', 'u1', NOW)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.noticeRead.createMany).not.toHaveBeenCalled();
    });
  });

  describe('운영자', () => {
    it('운영자가 아니면 올리기·고치기·지우기·전체 목록이 모두 막힌다', async () => {
      const { prisma, service } = setup(false);
      await expect(service.create('u1', { title: '공지', body: '본문' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.update('n1', 'u1', { title: '공지' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.remove('n1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.adminList('u1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.notice.create).not.toHaveBeenCalled();
      expect(prisma.notice.deleteMany).not.toHaveBeenCalled();
    });

    it('비활성화된 운영자 계정도 막는다', async () => {
      const { prisma, service } = setup();
      prisma.user.findUnique.mockResolvedValue({ isPlatformAdmin: true, isActive: false });
      await expect(service.create('u1', { title: '공지', body: '본문' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('올릴 때 제목·본문을 다듬고 올린 사람을 남긴다', async () => {
      const { prisma, service } = setup();
      await service.create('admin', { title: '  점검 안내 ', body: '본문\n둘째 줄 ', isRequired: true, publishedAt: '2026-11-20T00:00:00Z' });
      expect(prisma.notice.create.mock.calls[0][0].data).toEqual({
        title: '점검 안내',
        body: '본문\n둘째 줄',
        isRequired: true,
        publishedAt: new Date('2026-11-20T00:00:00Z'),
        expiresAt: null,
        createdById: 'admin',
      });
    });

    it('잘못된 입력을 거절한다', async () => {
      const { service } = setup();
      await expect(service.create('a', { title: ' ', body: '본문' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('a', { title: '제목', body: '' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('a', { title: 'x'.repeat(121), body: '본문' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('a', { title: '제목', body: '본문', isRequired: 'yes' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create('a', { title: '제목', body: '본문', publishedAt: '내일' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create('a', { title: '제목', body: '본문', publishedAt: '2026-11-20T00:00:00Z', expiresAt: '2026-11-19T00:00:00Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('고칠 때는 보낸 칸만 바꾸고, 종료일은 null로 없앨 수 있다', async () => {
      const { prisma, service } = setup();
      const current = { id: 'n1', publishedAt: new Date('2026-11-01T00:00:00Z'), expiresAt: new Date('2026-12-01T00:00:00Z') };
      prisma.notice.findUnique.mockResolvedValue(current);
      await service.update('n1', 'admin', { isRequired: true });
      expect(prisma.notice.update.mock.calls[0][0].data).toEqual({
        title: undefined, body: undefined, isRequired: true, publishedAt: current.publishedAt, expiresAt: current.expiresAt,
      });
      await service.update('n1', 'admin', { expiresAt: null });
      expect(prisma.notice.update.mock.calls[1][0].data.expiresAt).toBeNull();
      // 이미 있는 게시 시작보다 앞선 종료일은 거절
      await expect(service.update('n1', 'admin', { expiresAt: '2026-10-01T00:00:00Z' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update('n1', 'admin', { publishedAt: null })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('없는 공지를 고치거나 지우면 없다고 답한다', async () => {
      const { prisma, service } = setup();
      prisma.notice.findUnique.mockResolvedValue(null);
      prisma.notice.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.update('nx', 'admin', { title: '제목' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove('nx', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
