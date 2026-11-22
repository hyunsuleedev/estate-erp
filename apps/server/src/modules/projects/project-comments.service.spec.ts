import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectCommentsService } from './project-comments.service';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const author = { userId: 'user-author', officeId: OFFICE_ID, role: 'agent' };
const colleague = { userId: 'user-other', officeId: OFFICE_ID, role: 'agent' };
const manager = { userId: 'user-manager', officeId: OFFICE_ID, role: 'manager' };

function setup(options: { projectExists?: boolean; comment?: { id: string; authorId: string | null } | null } = {}) {
  const tx = {
    project: {
      findFirst: jest.fn(async () => (options.projectExists === false ? null : { id: PROJECT_ID })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    projectComment: {
      count: jest.fn(async () => 3),
      findMany: jest.fn(async () => [{ id: 'c3' }, { id: 'c2' }, { id: 'c1' }]),
      findFirst: jest.fn(async () =>
        options.comment === undefined ? { id: 'c1', authorId: author.userId } : options.comment,
      ),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'new', ...args.data })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'c1', ...args.data })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const prisma = { ...tx, $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)) };
  return { service: new ProjectCommentsService(prisma as never), tx };
}

describe('ProjectCommentsService', () => {
  it('최근 쪽을 오래된 것부터 주고 전체 수를 함께 알린다', async () => {
    const { service, tx } = setup();
    const list = await service.findAll(PROJECT_ID, OFFICE_ID);
    expect(tx.projectComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { officeId: OFFICE_ID, projectId: PROJECT_ID } }),
    );
    expect(list.total).toBe(3);
    expect(list.items.map((item) => item.id)).toEqual(['c1', 'c2', 'c3']);
    // 더 오래된 코멘트가 없다.
    expect(list.nextBefore).toBeNull();
  });

  it('쪽보다 많으면 가장 오래된 코멘트의 "적은 때|id"를 주고, 그것으로 더 오래된 쪽을 끝까지 읽는다', async () => {
    const { service, tx } = setup();
    const id = (n: number) => `00000000-0000-4000-8000-0000000000c${n}`;
    const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`);
    // 최근 것부터: c3, c2, (하나 더 읽은) c1
    tx.projectComment.findMany.mockResolvedValueOnce([
      { id: id(3), createdAt: at(20) },
      { id: id(2), createdAt: at(20) },
      { id: id(1), createdAt: at(19) },
    ] as never);
    const first = await service.findAll(PROJECT_ID, OFFICE_ID, { limit: 2 });
    expect(tx.projectComment.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 3 }));
    expect(first.items.map((item) => item.id)).toEqual([id(2), id(3)]);
    expect(first.nextBefore).toBe(`2026-11-20T00:00:00.000Z|${id(2)}`);

    tx.projectComment.findMany.mockResolvedValueOnce([{ id: id(1), createdAt: at(19) }] as never);
    const older = await service.findAll(PROJECT_ID, OFFICE_ID, { limit: 2, before: first.nextBefore! });
    // 같은 시각에 적힌 코멘트도 빠지거나 겹치지 않게 id까지 견준다.
    expect(tx.projectComment.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          officeId: OFFICE_ID,
          projectId: PROJECT_ID,
          OR: [{ createdAt: { lt: at(20) } }, { createdAt: at(20), id: { lt: id(2) } }],
        },
      }),
    );
    expect(older.items.map((item) => item.id)).toEqual([id(1)]);
    expect(older.nextBefore).toBeNull();
    // 기준이 된 코멘트를 다시 찾지 않는다: 그 사이에 지워져도 같은 값으로 이어 읽힌다.
    expect(tx.projectComment.findFirst).not.toHaveBeenCalled();
  });

  it('before나 limit의 형식이 틀리면 조용히 처음 쪽을 주지 않고 거절한다', async () => {
    const { service, tx } = setup();
    const id = '00000000-0000-4000-8000-0000000000c9';
    for (const before of ['c2', id, `어제|${id}`, '2026-11-20T00:00:00.000Z|c2', `2026-11-20T00:00:00.000Z|${id}|x`]) {
      await expect(service.findAll(PROJECT_ID, OFFICE_ID, { before })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    await expect(service.findAll(PROJECT_ID, OFFICE_ID, { limit: 101 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.projectComment.findMany).not.toHaveBeenCalled();
  });

  it('다른 사무소의 프로젝트나 없는 프로젝트에는 읽지도 적지도 못한다', async () => {
    const { service, tx } = setup({ projectExists: false });
    await expect(service.findAll(PROJECT_ID, OFFICE_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.create(PROJECT_ID, author, { body: '메모' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROJECT_ID, officeId: OFFICE_ID } }),
    );
    expect(tx.projectComment.create).not.toHaveBeenCalled();
  });

  it('적은 사람을 남기고, 앞뒤 빈칸을 뗀 글을 저장하고, 프로젝트의 고친 때를 올린다', async () => {
    const { service, tx } = setup();
    await service.create(PROJECT_ID, author, { body: '  잔금일 12/20로 협의 중  ' });
    expect(tx.projectComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          officeId: OFFICE_ID,
          projectId: PROJECT_ID,
          authorId: author.userId,
          body: '잔금일 12/20로 협의 중',
        },
      }),
    );
    expect(tx.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROJECT_ID, officeId: OFFICE_ID } }),
    );
  });

  it('빈 글과 너무 긴 글은 받지 않는다', async () => {
    const { service, tx } = setup();
    await expect(service.create(PROJECT_ID, author, { body: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create(PROJECT_ID, author, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(PROJECT_ID, author, { body: '가'.repeat(5001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.projectComment.create).not.toHaveBeenCalled();
  });

  it('고치는 것은 적은 사람만 한다', async () => {
    const { service, tx } = setup();
    await expect(
      service.update(PROJECT_ID, 'c1', colleague, { body: '고침' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(PROJECT_ID, 'c1', manager, { body: '고침' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.projectComment.update).not.toHaveBeenCalled();
    await service.update(PROJECT_ID, 'c1', author, { body: '고침' });
    expect(tx.projectComment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { body: '고침' } }),
    );
  });

  it('지우는 것은 적은 사람과 대표·관리자가 한다', async () => {
    const { service, tx } = setup();
    await expect(service.remove(PROJECT_ID, 'c1', colleague)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.projectComment.deleteMany).not.toHaveBeenCalled();
    await service.remove(PROJECT_ID, 'c1', manager);
    await service.remove(PROJECT_ID, 'c1', author);
    expect(tx.projectComment.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.projectComment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'c1', officeId: OFFICE_ID, projectId: PROJECT_ID },
    });
  });

  it('다른 프로젝트의 코멘트는 이 프로젝트 주소로 고치거나 지우지 못한다', async () => {
    const { service, tx } = setup({ comment: null });
    await expect(service.update(PROJECT_ID, 'c9', author, { body: '고침' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(PROJECT_ID, 'c9', manager)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.projectComment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c9', officeId: OFFICE_ID, projectId: PROJECT_ID } }),
    );
  });
});
