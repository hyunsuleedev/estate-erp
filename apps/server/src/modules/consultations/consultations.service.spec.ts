import { BadRequestException } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';

describe('ConsultationsService', () => {
  function createService() {
    const prisma = {
      consultation: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      contact: { findFirst: jest.fn() },
      buyerRequirement: { findFirst: jest.fn() },
      buyerIntake: { findFirst: jest.fn() },
      buyerIntakeContact: { findFirst: jest.fn() },
      callRecording: { findFirst: jest.fn() },
    };

    const callIntelligence = {
      startTranscription: jest.fn(),
      requestReanalysis: jest.fn(),
    };

    return {
      prisma,
      callIntelligence,
      service: new ConsultationsService(prisma as never, callIntelligence as never),
    };
  }

  it('builds entity-aware filters for contact, property hierarchy, context, and global search', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', {
      contactId: 'contact-1',
      siteId: 'site-1',
      dongId: 'dong-1',
      unitId: 'unit-1',
      context: 'property',
      q: '김소유',
    });

    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { officeId: 'office-1' },
            { contactId: 'contact-1' },
            { property: { siteId: 'site-1' } },
            { property: { unit: { dongId: 'dong-1' } } },
            { property: { unitId: 'unit-1' } },
            { propertyId: { not: null } },
            {
              OR: expect.arrayContaining([
                { content: { contains: '김소유', mode: 'insensitive' } },
                { contact: { name: { contains: '김소유', mode: 'insensitive' } } },
                { property: { site: { name: { contains: '김소유', mode: 'insensitive' } } } },
                { property: { unit: { name: { contains: '김소유', mode: 'insensitive' } } } },
              ]),
            },
          ],
        },
      }),
    );
  });

  it('filters unlinked consultations without excluding office scoping', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', { context: 'unlinked' });

    expect(prisma.consultation.count).toHaveBeenCalledWith({
      where: {
        AND: [
          { officeId: 'office-1' },
          {
            propertyId: null,
            listingIntakeId: null,
            listingId: null,
            matchId: null,
            buyerIntakeId: null,
            buyerReqId: null,
          },
        ],
      },
    });
  });

  it('maps action-required outcome filters to consultation content keywords', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', { outcome: 'actionRequired' });

    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { officeId: 'office-1' },
            {
              OR: expect.arrayContaining([
                { content: { contains: '필요', mode: 'insensitive' } },
                { content: { contains: '요청', mode: 'insensitive' } },
                { content: { contains: '문의', mode: 'insensitive' } },
              ]),
            },
          ],
        },
      }),
    );
  });

  it('구매요건 상담의 BuyerIntake를 자동으로 채운다', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
    prisma.buyerRequirement.findFirst.mockResolvedValue({
      id: 'requirement-1',
      buyerIntakeId: 'intake-1',
    });
    prisma.buyerIntakeContact.findFirst.mockResolvedValue({
      id: 'participant-1',
    });
    prisma.consultation.create.mockResolvedValue({
      id: 'consultation-1',
      contact: { id: 'contact-1', phones: [] },
    });

    await service.create('office-1', 'user-1', {
      contactId: 'contact-1',
      type: 'phone',
      content: '예산 조건을 다시 확인함',
      buyerReqId: 'requirement-1',
    });

    expect(prisma.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buyerIntakeId: 'intake-1',
          buyerReqId: 'requirement-1',
        }),
      }),
    );
  });

  it('구매요건과 다른 BuyerIntake를 동시에 지정하면 거부한다', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
    prisma.buyerRequirement.findFirst.mockResolvedValue({
      id: 'requirement-1',
      buyerIntakeId: 'intake-1',
    });

    await expect(
      service.create('office-1', 'user-1', {
        contactId: 'contact-1',
        type: 'phone',
        content: '잘못 연결된 상담',
        buyerIntakeId: 'intake-2',
        buyerReqId: 'requirement-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.consultation.create).not.toHaveBeenCalled();
  });

  it('BuyerIntake 참여자가 아닌 연락처의 상담 연결을 거부한다', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
    prisma.buyerIntake.findFirst.mockResolvedValue({ id: 'intake-1' });
    prisma.buyerIntakeContact.findFirst.mockResolvedValue(null);

    await expect(
      service.create('office-1', 'user-1', {
        contactId: 'contact-1',
        type: 'phone',
        content: '참여자가 아닌 연락처',
        buyerIntakeId: 'intake-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('통화 연락처를 바꾸면 이전 상대 기준의 처리 전 제안을 바로 없애고 다시 분석한다', async () => {
    const { prisma, service, callIntelligence } = createService();
    const update = jest.fn((args: unknown) => ({ op: 'update', args }));
    const deleteMany = jest.fn((args: unknown) => ({ op: 'deleteMany', args }));
    Object.assign(prisma.callRecording, {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ id: 'rec-1' })
        .mockResolvedValue({ id: 'rec-1', contact: null, suggestions: [] }),
      findUnique: jest.fn().mockResolvedValue({ contactId: 'contact-A', sttStatus: 'completed' }),
      update,
    });
    Object.assign(prisma, {
      callActionSuggestion: { deleteMany },
      $transaction: jest.fn(async (operations: unknown[]) => operations),
    });
    prisma.contact.findFirst.mockResolvedValue({ id: 'contact-B' });
    callIntelligence.requestReanalysis.mockResolvedValue({});
    Object.assign(callIntelligence, { describeSuggestionTargets: jest.fn().mockResolvedValue({}) });

    await service.updateRecording('rec-1', 'office-1', { contactId: 'contact-B' });

    // 연락처 변경과 제안 무효화를 함께 저장한다 (다시 분석이 실패해도 이전 고객 제안이 남지 않는다)
    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledWith([
      { op: 'update', args: { where: { id: 'rec-1' }, data: { contactId: 'contact-B' } } },
      { op: 'deleteMany', args: { where: { recordingId: 'rec-1', status: 'pending' } } },
    ]);
    expect(callIntelligence.requestReanalysis).toHaveBeenCalledWith('rec-1', 'office-1');
  });
});

