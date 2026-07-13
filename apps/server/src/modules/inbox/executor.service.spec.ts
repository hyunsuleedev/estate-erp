import { DraftExecutorService } from './executor.service';

describe('DraftExecutorService contract artifact approval', () => {
  it('applies exactly the reviewed contract revision and content hash', async () => {
    const prisma = {
      entityDraft: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'draft-1',
          officeId: 'office-1',
          entityType: 'contract',
          operation: 'action',
          entityId: 'contract-1',
          status: 'approved',
          executor: 'server',
          attempts: 0,
          decidedById: 'owner-1',
          proposedChanges: {
            tool: 'apply_contract_document_revision',
            documentId: 'document-1',
            revisionId: 'revision-2',
            contentHash: 'a'.repeat(64),
            _artifactRevision: { revisionNo: 2 },
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const contracts = {
      applyRevision: jest.fn().mockResolvedValue({
        document: { id: 'document-1' },
        revision: { id: 'revision-2' },
      }),
    };
    const service = new DraftExecutorService(
      prisma as never,
      contracts as never,
    );

    await service.execute('draft-1');

    expect(contracts.applyRevision).toHaveBeenCalledWith(
      'document-1',
      'revision-2',
      'office-1',
      'owner-1',
      'a'.repeat(64),
    );
    expect(prisma.entityDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: expect.objectContaining({
        status: 'executed',
        resultEntityId: 'document-1',
      }),
    });
  });
});
