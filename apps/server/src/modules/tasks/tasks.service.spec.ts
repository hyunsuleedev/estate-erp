import { TasksService } from './tasks.service';

describe('TasksService', () => {
  function createService() {
    const prisma = {
      task: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
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
});
