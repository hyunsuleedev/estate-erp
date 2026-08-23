import { TasksService } from './tasks.service';
import { ConflictException } from '@nestjs/common';

describe('TasksService', () => {
  function createService() {
    const prisma = {
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
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
        assignedToId: 'assignee-1',
        buyerReqId: 'buyer-req-1',
        matchId: 'match-1',
        dealId: 'deal-1',
        contractId: 'contract-1',
      },
      'assigner-1',
    );

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'assigner-1',
          assignedById: 'assigner-1',
          assignedAt: expect.any(Date),
          buyerReqId: 'buyer-req-1',
          matchId: 'match-1',
          dealId: 'deal-1',
          contractId: 'contract-1',
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
            },
          },
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
      { assignedToId: 'assignee-1' },
      'assigner-1',
    );

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: 'assignee-1',
          assignedById: 'assigner-1',
          assignedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('clears assignment metadata when unassigning a task', async () => {
    const { prisma, service } = createService();
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1', officeId: 'office-1' });
    prisma.task.update.mockResolvedValue({ id: 'task-1' });

    await (service.update as any)(
      'task-1',
      'office-1',
      { assignedToId: null },
      'assigner-1',
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
      assignedToId: 'assignee-1',
    });

    await (service.update as any)(
      'task-1',
      'office-1',
      { assignedToId: 'assignee-1' },
      'assigner-1',
    );

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        officeId: 'office-1',
        userId: 'assignee-1',
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
});
