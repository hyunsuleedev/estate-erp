import { BadRequestException, ConflictException } from '@nestjs/common';
import { AgentControlPlaneService } from './control-plane.service';

describe('AgentControlPlaneService', () => {
  it('links an agent session to an AgentActionRequest without a Task', async () => {
    const session = {
      id: 'session-1',
      officeId: 'office-1',
      taskId: null,
      agentActionRequestId: 'action-1',
    };
    const prisma = {
      agentActionRequest: {
        findFirst: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
      agentSession: {
        create: jest.fn().mockResolvedValue(session),
      },
    };
    const service = new AgentControlPlaneService(prisma as never);

    const result = await service.createSession('office-1', {
      agentKey: 'esiljang-ad-manager',
      taskKey: 'agent-action:action-1',
      agentActionRequestId: 'action-1',
    });

    expect(result).toBe(session);
    expect(prisma.agentSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: null,
        agentActionRequestId: 'action-1',
      }),
    });
  });

  it('rejects a session linked to both Task and AgentActionRequest', async () => {
    const service = new AgentControlPlaneService({} as never);

    await expect(
      service.createSession('office-1', {
        agentKey: 'worker',
        taskKey: 'invalid-mixed-work-item',
        taskId: 'task-1',
        agentActionRequestId: 'action-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coalesces an active wakeup with the same office idempotency key', async () => {
    const session = { id: 'session-1', officeId: 'office-1' };
    const existing = {
      id: 'wakeup-1',
      officeId: 'office-1',
      sessionId: session.id,
      status: 'queued',
      coalescedCount: 0,
    };
    const prisma = {
      agentSession: {
        findFirst: jest.fn().mockResolvedValue(session),
      },
      agentWakeupRequest: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest
          .fn()
          .mockResolvedValue({ ...existing, coalescedCount: 1 }),
      },
    };
    const service = new AgentControlPlaneService(prisma as never);

    const result = await service.createWakeup('office-1', {
      sessionId: session.id,
      source: 'approval',
      reason: 'approval_approved',
      idempotencyKey: 'approval:123:approved',
    });

    expect(result.created).toBe(false);
    expect(result.wakeup.coalescedCount).toBe(1);
    expect(prisma.agentWakeupRequest.findFirst).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        idempotencyKey: 'approval:123:approved',
        status: { in: ['queued', 'claimed'] },
      },
    });
    expect(prisma.agentWakeupRequest.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { coalescedCount: { increment: 1 } },
    });
  });

  it('atomically claims a wakeup and creates the next run attempt', async () => {
    const wakeup = {
      id: 'wakeup-1',
      officeId: 'office-1',
      sessionId: 'session-1',
      source: 'comment',
      reason: 'revision_requested',
    };
    const run = {
      id: 'run-2',
      officeId: 'office-1',
      sessionId: wakeup.sessionId,
      wakeupRequestId: wakeup.id,
      status: 'running',
      attempt: 2,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: wakeup.id }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      agentWakeupRequest: {
        findFirstOrThrow: jest.fn().mockResolvedValue(wakeup),
      },
      agentRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _max: { attempt: 1 } }),
        create: jest.fn().mockResolvedValue(run),
      },
      agentSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new AgentControlPlaneService(prisma as never);

    const claimed = await service.claimNextWakeup(
      'office-1',
      'worker-a',
      { leaseMs: 30_000 },
    );

    expect(claimed).toEqual({ wakeup, run });
    expect(tx.agentRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId: 'office-1',
          wakeupRequestId: wakeup.id,
          status: 'running',
        }),
      }),
    );
    expect(tx.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: 'office-1',
        sessionId: wakeup.sessionId,
        wakeupRequestId: wakeup.id,
        workerId: 'worker-a',
        attempt: 2,
        status: 'running',
      }),
    });
    expect(tx.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: wakeup.sessionId, officeId: 'office-1' },
      data: expect.objectContaining({ status: 'active' }),
    });
  });

  it('does not let a stale worker complete a run owned by another worker', async () => {
    const tx = {
      agentRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'run-1',
          officeId: 'office-1',
          sessionId: 'session-1',
          wakeupRequestId: 'wakeup-1',
          status: 'running',
          workerId: 'worker-a',
          leaseExpiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new AgentControlPlaneService(prisma as never);

    await expect(
      service.completeRun('office-1', 'run-1', 'worker-b', {
        outcome: 'completed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('completes a leased run and pauses its session for human input', async () => {
    const running = {
      id: 'run-1',
      officeId: 'office-1',
      sessionId: 'session-1',
      wakeupRequestId: 'wakeup-1',
      status: 'running',
      workerId: 'worker-a',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    };
    const completed = {
      ...running,
      status: 'completed',
      leaseExpiresAt: null,
    };
    const tx = {
      agentRun: {
        findFirst: jest.fn().mockResolvedValue(running),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue(completed),
      },
      agentWakeupRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      agentSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new AgentControlPlaneService(prisma as never);

    const result = await service.completeRun(
      'office-1',
      running.id,
      'worker-a',
      {
        outcome: 'awaiting_input',
        waitingReason: '특약을 확인해 주세요.',
      },
    );

    expect(result).toBe(completed);
    expect(tx.agentRun.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: running.id,
        officeId: 'office-1',
        status: 'running',
        workerId: 'worker-a',
        leaseExpiresAt: { gt: expect.any(Date) },
      }),
      data: expect.objectContaining({
        status: 'completed',
        leaseExpiresAt: null,
      }),
    });
    expect(tx.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: running.sessionId, officeId: 'office-1' },
      data: expect.objectContaining({
        status: 'awaiting_input',
        waitingReason: '특약을 확인해 주세요.',
      }),
    });
  });

  it('appends activities with a monotonic session-local sequence', async () => {
    const activity = {
      id: 'activity-1',
      officeId: 'office-1',
      sessionId: 'session-1',
      runId: 'run-1',
      sequence: 8,
      type: 'action',
      message: '계약서 초안 생성',
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: '' }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      agentSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
      agentRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1' }),
      },
      agentActivity: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 7 } }),
        create: jest.fn().mockResolvedValue(activity),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new AgentControlPlaneService(prisma as never);

    const result = await service.appendActivity('office-1', {
      sessionId: 'session-1',
      runId: 'run-1',
      type: 'action',
      message: ' 계약서 초안 생성 ',
    });

    expect(result).toBe(activity);
    expect(tx.agentActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: 'office-1',
        sessionId: 'session-1',
        runId: 'run-1',
        sequence: 8,
        message: '계약서 초안 생성',
      }),
    });
  });

  it('rejects an empty activity and invalid lease duration', async () => {
    const service = new AgentControlPlaneService({} as never);

    await expect(
      service.appendActivity('office-1', {
        sessionId: 'session-1',
        type: 'thought',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.claimNextWakeup('office-1', 'worker-a', { leaseMs: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createWakeup('office-1', {
        sessionId: 'session-1',
        source: 'comment',
        reason: 'revision_requested',
        maxAttempts: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
