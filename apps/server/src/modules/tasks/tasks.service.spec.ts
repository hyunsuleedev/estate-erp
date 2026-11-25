import { TasksService } from './tasks.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

const ASSIGNEE = '11111111-1111-4111-8111-111111111111';
const ASSIGNER = '22222222-2222-4222-8222-222222222222';
const BUYER_REQ = '33333333-3333-4333-8333-333333333333';
const MATCH = '44444444-4444-4444-8444-444444444444';
const DEAL = '55555555-5555-4555-8555-555555555555';
const CONTRACT = '66666666-6666-4666-8666-666666666666';
const CONTACT = '77777777-7777-4777-8777-777777777777';
const PROJECT = '88888888-8888-4888-8888-888888888888';

describe('TasksService', () => {
  function createService() {
    const count = () => jest.fn().mockResolvedValue(1);
    const prisma = {
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        create: jest.fn(),
      },
      user: { count: count() },
      contact: { count: count() },
      property: { count: count() },
      listingIntake: { count: count() },
      listing: { count: count() },
      consultation: { count: count() },
      buyerRequirement: { count: count() },
      match: { count: count() },
      deal: { count: count() },
      contract: { count: count() },
      project: { count: count() },
    };

    return {
      prisma,
      service: new TasksService(prisma as never),
    };
  }

  it('stores assignment metadata and all CRM context fields when creating a task', async () => {
    const { prisma, service } = createService();
    prisma.task.create.mockResolvedValue({ id: 'task-1' });

    await (service.create as any)(
      'office-1',
      {
        title: '계약서 특약 확인',
        assignedToId: ASSIGNEE,
        buyerReqId: BUYER_REQ,
        matchId: MATCH,
        dealId: DEAL,
        contractId: CONTRACT,
      },
      ASSIGNER,
    );

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: ASSIGNER,
          assignedById: ASSIGNER,
          assignedAt: expect.any(Date),
          buyerReqId: BUYER_REQ,
          matchId: MATCH,
          dealId: DEAL,
          contractId: CONTRACT,
        }),
      }),
    );
  });

  it('includes the property dong needed by task context labels', async () => {
    const { prisma, service } = createService();
    prisma.task.findMany.mockResolvedValue([]);

    await service.findAll('office-1');

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          property: {
            include: {
              site: true,
              unit: {
                include: {
                  dong: {
                    select: { id: true, name: true, isPlaceholder: true },
                  },
                },
              },
              listingIntakes: {
                select: { id: true, lifecycleStatus: true, closedReason: true },
                orderBy: { receivedAt: 'desc' },
                take: 1,
              },
            },
          },
          deal: expect.objectContaining({
            select: expect.objectContaining({ stage: true, isCancelled: true }),
          }),
        }),
      }),
    );
  });

  it('stamps assignment metadata when assigning an existing task', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1' });
    prisma.task.update.mockResolvedValue({ id: 'task-1' });

    await (service.update as any)(
      'task-1',
      'office-1',
      { assignedToId: ASSIGNEE },
      ASSIGNER,
    );

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: ASSIGNEE,
          assignedById: ASSIGNER,
          assignedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('clears assignment metadata when unassigning a task', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1', assignedToId: ASSIGNEE });
    prisma.task.update.mockResolvedValue({ id: 'task-1' });

    await (service.update as any)(
      'task-1',
      'office-1',
      { assignedToId: null },
      ASSIGNER,
    );

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: null,
          assignedById: null,
          assignedAt: null,
        }),
      }),
    );
  });

  it('notifies the assignee when another user assigns a task', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1' });
    prisma.task.update.mockResolvedValue({
      id: 'task-1',
      title: '매수자 콜백',
      assignedToId: ASSIGNEE,
    });

    await (service.update as any)(
      'task-1',
      'office-1',
      { assignedToId: ASSIGNEE },
      ASSIGNER,
    );

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        officeId: 'office-1',
        userId: ASSIGNEE,
        type: 'task_assigned',
        title: '새 업무가 배정되었습니다',
        content: '매수자 콜백',
        linkType: 'task',
        linkId: 'task-1',
      },
    });
  });

  it('atomically claims a pending advertisement task for the current user', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst
      .mockResolvedValueOnce({
        id: 'task-1',
        officeId: 'office-1',
        status: 'pending',
        assignedToId: null,
        assignedById: null,
        assignedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        officeId: 'office-1',
        status: 'in_progress',
        assignedToId: 'user-1',
      });
    prisma.task.updateMany.mockResolvedValue({ count: 1 });

    const task = await service.claim('task-1', 'office-1', 'user-1');

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        officeId: 'office-1',
        status: 'pending',
        OR: [{ assignedToId: null }, { assignedToId: 'user-1' }],
      },
      data: expect.objectContaining({
        status: 'in_progress',
        assignedToId: 'user-1',
        assignedById: 'user-1',
        assignedAt: expect.any(Date),
      }),
    });
    expect(task).toEqual(expect.objectContaining({ status: 'in_progress' }));
  });

  it('rejects a task already assigned to another user', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      officeId: 'office-1',
      status: 'pending',
      assignedToId: 'other-user',
    });

    await expect(
      service.claim('task-1', 'office-1', 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a task without a title', async () => {
    const { prisma, service } = createService();
    await expect(service.create('office-1', { title: '   ' }, ASSIGNER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects an unreadable due date with 400 instead of a database error', async () => {
    const { prisma, service } = createService();
    await expect(
      service.create('office-1', { title: '등기부 열람', dueDate: 'xx' }, ASSIGNER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('refuses to link a contact that is not in the same office', async () => {
    const { prisma, service } = createService();
    prisma.contact.count.mockResolvedValue(0);
    await expect(
      service.create('office-1', { title: '매도인 확인 전화', contactId: CONTACT }, ASSIGNER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.contact.count).toHaveBeenCalledWith({ where: { id: CONTACT, officeId: 'office-1' } });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('refuses an assignee who is not active staff of the office', async () => {
    const { prisma, service } = createService();
    prisma.user.count.mockResolvedValue(0);
    await expect(
      service.create('office-1', { title: '임장 준비', assignedToId: ASSIGNEE }, ASSIGNER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not restamp or re-notify when an edit keeps the same assignee', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1', assignedToId: ASSIGNEE });
    prisma.task.update.mockResolvedValue({ id: 'task-1', title: '제목만 고침', assignedToId: ASSIGNEE });

    await service.update('task-1', 'office-1', { title: '제목만 고침', assignedToId: ASSIGNEE }, ASSIGNER);

    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('assignedById');
    expect(data).not.toHaveProperty('assignedAt');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('clears the description when an empty one is saved', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1' });
    prisma.task.update.mockResolvedValue({ id: 'task-1' });

    await service.update('task-1', 'office-1', { content: '' }, ASSIGNER);

    expect(prisma.task.update.mock.calls[0][0].data.content).toBeNull();
  });

  it('does not let an agent delete a system-made task', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1', source: 'system' });

    await expect(service.remove('task-1', 'office-1', 'agent')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.deleteMany).not.toHaveBeenCalled();
  });

  it('does not let an edit launder a system task into a manual one before deleting', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1', source: 'system' });
    prisma.task.update.mockResolvedValue({ id: 'task-1' });

    await (service.update as any)('task-1', 'office-1', { source: 'manual', title: '독촉' }, ASSIGNER);

    expect(prisma.task.update.mock.calls[0][0].data).not.toHaveProperty('source');
  });

  it('deletes an agent-deleted task only while it is still manual', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1', source: 'manual' });

    await service.remove('task-1', 'office-1', 'agent');

    expect(prisma.task.deleteMany).toHaveBeenCalledWith({
      where: { id: 'task-1', officeId: 'office-1', source: 'manual' },
    });
  });

  it('keeps a call-analysis task unassigned when the recording staff is no longer active', async () => {
    const { prisma, service } = createService();
    prisma.user.count.mockResolvedValue(0);
    prisma.task.create.mockResolvedValue({ id: 'task-1', title: '매수인 콜백', assignedToId: null });

    await service.create(
      'office-1',
      { title: '매수인 콜백', source: 'ai', assignedToId: ASSIGNEE },
      ASSIGNER,
      { id: 'suggestion-1', dropUnavailableAssignee: true },
    );

    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.assignedToId).toBeUndefined();
    expect(data.assignedById).toBeUndefined();
  });

  it('still refuses an inactive assignee that a person picked', async () => {
    const { prisma, service } = createService();
    prisma.user.count.mockResolvedValue(0);
    await expect(
      service.create('office-1', { title: '매수인 콜백', assignedToId: ASSIGNEE }, ASSIGNER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  describe('프로젝트에 적은 업무', () => {
    it('프로젝트를 달아 만들고, 그 프로젝트의 업무만 찾고, 응답에 프로젝트를 싣는다', async () => {
      const { prisma, service } = createService();
      prisma.task.create.mockResolvedValue({ id: 'task-1', projectId: PROJECT });
      prisma.task.findMany.mockResolvedValue([]);

      await service.create('office-1', { title: '위임장 사본 확인', projectId: PROJECT }, ASSIGNER);
      expect(prisma.project.count).toHaveBeenCalledWith({ where: { id: PROJECT, officeId: 'office-1' } });
      const created = prisma.task.create.mock.calls[0][0];
      expect(created.data.projectId).toBe(PROJECT);
      expect(created.include.project).toEqual({ select: { id: true, title: true, archivedAt: true } });

      await service.findAll('office-1', { projectId: PROJECT });
      expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({ officeId: 'office-1', projectId: PROJECT });
    });

    it('다른 사무소의 프로젝트(이 사무소에서 못 찾는 것)에는 달지 못한다', async () => {
      const { prisma, service } = createService();
      prisma.project.count.mockResolvedValue(0);
      await expect(
        service.create('office-1', { title: '업무', projectId: PROJECT }, ASSIGNER),
      ).rejects.toThrow('연결할 프로젝트를 찾을 수 없습니다.');
      expect(prisma.task.create).not.toHaveBeenCalled();

      prisma.task.findFirst.mockResolvedValue({ id: 'task-1', assignedToId: null });
      await expect(
        service.update('task-1', 'office-1', { projectId: PROJECT }, ASSIGNER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('프로젝트에서 뺄 수 있고(null), 보내지 않으면 그대로 둔다', async () => {
      const { prisma, service } = createService();
      prisma.task.findFirst.mockResolvedValue({ id: 'task-1', assignedToId: null });
      prisma.task.update.mockResolvedValue({ id: 'task-1' });

      await service.update('task-1', 'office-1', { projectId: null }, ASSIGNER);
      expect(prisma.task.update.mock.calls[0][0].data.projectId).toBeNull();

      await service.update('task-1', 'office-1', { status: 'completed' }, ASSIGNER);
      expect(prisma.task.update.mock.calls[1][0].data.projectId).toBeUndefined();
    });

    it('형식이 틀린 프로젝트 id로 찾으면 DB를 부르지 않고 빈 목록을 준다', async () => {
      const { prisma, service } = createService();
      await expect(service.findAll('office-1', { projectId: 'not-a-uuid' })).resolves.toEqual([]);
      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });
  });
});
