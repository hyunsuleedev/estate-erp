import { ConflictException } from '@nestjs/common';
import { InboxService } from './inbox.service';

describe('InboxService agent leases', () => {
  function createService() {
    const prisma = {
      entityDraft: {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      entityDraftComment: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      agentWakeupRequest: { create: jest.fn() },
      agentSession: { updateMany: jest.fn() },
      task: { updateMany: jest.fn() },
      $transaction: jest.fn(),
      $executeRaw: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (
        input:
          | Array<Promise<unknown>>
          | ((tx: typeof prisma) => Promise<unknown>),
      ) => (typeof input === 'function' ? input(prisma) : Promise.all(input)),
    );
    const executor = { execute: jest.fn() };
    const controlPlane = {
      appendActivity: jest.fn(),
      getSession: jest.fn(),
      getRun: jest.fn(),
    };
    return {
      prisma,
      executor,
      controlPlane,
      service: new InboxService(
        prisma as never,
        executor as never,
        controlPlane as never,
      ),
    };
  }

  const approvedDraft = {
    id: 'draft-1',
    officeId: 'office-1',
    executor: 'agent',
    status: 'approved',
    attempts: 0,
    maxAttempts: 3,
  };

  it('claims approved work with an owner, lease and attempt increment', async () => {
    const { prisma, service } = createService();
    prisma.entityDraft.findFirst.mockResolvedValue(approvedDraft);
    prisma.entityDraft.updateMany.mockResolvedValue({ count: 1 });

    await service.claimForAgent('draft-1', 'office-1', 'mcp:user-1', 60_000);

    expect(prisma.entityDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'draft-1',
          officeId: 'office-1',
          status: 'approved',
        }),
        data: expect.objectContaining({
          status: 'executing',
          claimedBy: 'mcp:user-1',
          attempts: { increment: 1 },
          claimedAt: expect.any(Date),
          lockExpiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does not let another agent finish a leased draft', async () => {
    const { prisma, service } = createService();
    prisma.entityDraft.findFirst.mockResolvedValue({
      ...approvedDraft,
      status: 'executing',
      claimedBy: 'mcp:user-1',
    });

    await expect(
      service.reportAgentExecution('draft-1', 'office-1', {
        status: 'executed',
        claimedBy: 'mcp:user-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.entityDraft.updateMany).not.toHaveBeenCalled();
  });

  it('returns expired leases to the queue and fails exhausted work', async () => {
    const { prisma, service } = createService();
    // 새 구현은 read-then-write 대신 술어 기반 set-update 2건($executeRaw)을
    // 한 트랜잭션으로 실행한다 — 재시도 소진(failed) 1건 + 재큐잉(approved) 1건.
    // 판정(attempts vs max_attempts)이 SQL 술어에 있으므로 동시 재시도-소진
    // 트랜잭션과 교차해도 낡은 값으로 approved 를 쓰는 경합이 없다.
    prisma.$executeRaw
      .mockResolvedValueOnce(1) // attempts >= max_attempts → failed
      .mockResolvedValueOnce(1); // attempts <  max_attempts → approved

    await expect(service.recoverExpiredAgentClaims('office-1')).resolves.toBe(2);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    const sqlText = (call: unknown[]) =>
      ((call[0] as { strings?: readonly string[] }).strings ?? (call[0] as readonly string[])).join(
        ' ',
      );
    const failedSql = sqlText(prisma.$executeRaw.mock.calls[0]);
    const requeueSql = sqlText(prisma.$executeRaw.mock.calls[1]);
    expect(failedSql).toContain('attempts >= max_attempts');
    expect(failedSql).toContain(`'failed'`);
    expect(requeueSql).toContain('attempts < max_attempts');
    expect(requeueSql).toContain(`'approved'`);
  });

  it('persists a comment wakeup with the review state transition', async () => {
    const { prisma, controlPlane, service } = createService();
    prisma.entityDraft.findFirst.mockResolvedValue({
      ...approvedDraft,
      status: 'pending',
      proposedChanges: {},
      agentSessionId: 'session-1',
      agentSession: { task: { id: 'task-1' } },
      comments: [],
    });
    prisma.entityDraftComment.create.mockResolvedValue({
      id: 'comment-1',
      body: '잔금일을 수정해주세요.',
    });
    prisma.entityDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.agentWakeupRequest.create.mockResolvedValue({ id: 'wakeup-1' });
    prisma.agentSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
    controlPlane.appendActivity.mockResolvedValue({ id: 'activity-1' });

    await service.addComment(
      'draft-1',
      'office-1',
      'user-1',
      '잔금일을 수정해주세요.',
    );

    expect(prisma.entityDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', officeId: 'office-1', status: 'pending' },
      data: { status: 'processing' },
    });
    expect(prisma.agentWakeupRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        source: 'comment',
        reason: 'revision_requested',
        idempotencyKey: 'draft:draft-1:comment:comment-1',
      }),
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'in_progress' } }),
    );
    expect(controlPlane.appendActivity).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({ sessionId: 'session-1', type: 'response' }),
    );
  });

  it('does not allow a versioned artifact to be edited in place', async () => {
    const { prisma, service } = createService();
    prisma.entityDraft.findFirst.mockResolvedValue({
      ...approvedDraft,
      status: 'pending',
      comments: [],
      agentSession: null,
      proposedChanges: {
        _artifactRevision: { revisionId: 'revision-1' },
      },
    });

    await expect(
      service.edit('draft-1', 'office-1', {
        proposedChanges: { contentHash: 'tampered' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.entityDraft.update).not.toHaveBeenCalled();
  });

  it('keeps a contract review pending when its artifact has validation errors', async () => {
    const { prisma, executor, service } = createService();
    prisma.entityDraft.findFirst.mockResolvedValue({
      ...approvedDraft,
      status: 'pending',
      comments: [],
      agentSession: null,
      proposedChanges: {
        _artifactRevision: {
          validation: {
            errors: [{ path: 'buyer.name', message: '매수인을 입력하세요.' }],
          },
        },
      },
    });

    await expect(
      service.decide('draft-1', 'office-1', 'owner-1'),
    ).rejects.toThrow(/검증 오류/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
