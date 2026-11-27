import { BadRequestException } from '@nestjs/common';
import { ConsultationsService, recordingDirection } from './consultations.service';

describe('ConsultationsService', () => {
  function createService() {
    const prisma = {
      consultation: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      contact: { findFirst: jest.fn() },
      // 연결 칸이 이 사무소의 것인지 세는 검사(assertLinksInOffice). 기본은 "있음"
      buyerRequirement: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      buyerIntake: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      buyerIntakeContact: { findFirst: jest.fn() },
      property: { count: jest.fn().mockResolvedValue(1) },
      listingIntake: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      deal: { count: jest.fn().mockResolvedValue(1) },
      project: { count: jest.fn().mockResolvedValue(1) },
      callRecording: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn().mockResolvedValue(1), create: jest.fn() },
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

  it('refuses links that belong to another office before saving', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    // 다른 사무소의 매물: 이 사무소 범위로 세면 0건
    prisma.property.count.mockResolvedValue(0);

    await expect(
      service.create('office-1', 'user-1', {
        contactId: '11111111-1111-4111-8111-111111111111',
        type: 'phone',
        content: '남의 매물',
        propertyId: '55555555-5555-4555-8555-555555555555',
      }),
    ).rejects.toThrow('연결할 매물을 찾을 수 없습니다.');
    expect(prisma.property.count).toHaveBeenCalledWith({
      where: { id: '55555555-5555-4555-8555-555555555555', officeId: 'office-1' },
    });
    // 모양이 틀린 id도 400으로 막는다 (DB까지 가지 않는다)
    await expect(
      service.create('office-1', 'user-1', {
        contactId: '11111111-1111-4111-8111-111111111111',
        type: 'phone',
        content: '이상한 id',
        listingIntakeId: 'abc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('office-1', 'user-1', { contactId: 'abc', type: 'phone', content: 'x' }),
    ).rejects.toThrow('연락처를 찾을 수 없습니다.');
    expect(prisma.consultation.create).not.toHaveBeenCalled();
  });

  it('refuses an empty note, an unknown method and a future time when writing a consultation', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });

    await expect(
      service.create('office-1', 'user-1', { contactId: '11111111-1111-4111-8111-111111111111', type: 'phone', content: '   ' }),
    ).rejects.toThrow('상담 내용을 입력하세요.');
    await expect(
      service.create('office-1', 'user-1', { contactId: '11111111-1111-4111-8111-111111111111', type: 'sms', content: '문자 상담' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('office-1', 'user-1', {
        contactId: '11111111-1111-4111-8111-111111111111',
        type: 'phone',
        content: '내일 통화',
        consultedAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.consultation.create).not.toHaveBeenCalled();
  });

  it('stores a past consultation time as the consultation date', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    prisma.consultation.create.mockResolvedValue({ id: 'c-1', contact: null, callRecording: null });
    const yesterday = new Date(Date.now() - 86_400_000);

    await service.create('office-1', 'user-1', {
      contactId: '11111111-1111-4111-8111-111111111111',
      type: 'visit',
      content: '  어제 방문  ',
      consultedAt: yesterday.toISOString(),
    });

    expect(prisma.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: '11111111-1111-4111-8111-111111111111',
          type: 'visit',
          content: '어제 방문',
          createdAt: yesterday,
        }),
      }),
    );
  });

  it("bumps the person's open buyer requirements' last contact date without overwriting a newer one", async () => {
    const { prisma, service } = createService();
    const contactId = '11111111-1111-4111-8111-111111111111';
    const consultedAt = new Date('2026-11-20T03:00:00.000Z');
    prisma.contact.findFirst.mockResolvedValue({ id: contactId });
    prisma.consultation.create.mockResolvedValue({ id: 'c-1', createdAt: consultedAt, contact: null, callRecording: null });

    await service.create('office-1', 'user-1', { contactId, type: 'phone', content: '30평대 찾음' });

    expect(prisma.buyerRequirement.updateMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        status: { not: 'completed' },
        buyerIntake: { contacts: { some: { contactId } } },
        OR: [{ lastContactDate: null }, { lastContactDate: { lt: consultedAt } }],
      },
      data: { lastContactDate: consultedAt },
    });
  });

  it('builds entity-aware filters for contact, property hierarchy, context, and global search', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', {
      contactId: '11111111-1111-4111-8111-111111111111',
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
            { contactId: '11111111-1111-4111-8111-111111111111' },
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
            buyerIntakeId: null,
            dealId: null,
            projectId: null,
          },
        ],
      },
    });
  });

  it('filters consultations by deal and project context', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.consultation.count.mockResolvedValue(0);

    await service.findAll('office-1', { context: 'deal' });
    expect(prisma.consultation.count).toHaveBeenCalledWith({
      where: { AND: [{ officeId: 'office-1' }, { dealId: { not: null } }] },
    });

    await service.findAll('office-1', { context: 'project' });
    expect(prisma.consultation.count).toHaveBeenCalledWith({
      where: { AND: [{ officeId: 'office-1' }, { projectId: { not: null } }] },
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

  it('의뢰 상담 생성 시 의뢰의 호실(propertyId)을 자동으로 채우고 다른 호실 지정은 거부한다', async () => {
    const { prisma, service } = createService();
    const contactId = '11111111-1111-4111-8111-111111111111';
    const intakeId = '22222222-2222-4222-8222-222222222222';
    const intakePropertyId = '55555555-5555-4555-8555-555555555555';
    const otherPropertyId = '66666666-6666-4666-8666-666666666666';

    prisma.contact.findFirst.mockResolvedValue({ id: contactId });
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: intakeId,
      propertyId: intakePropertyId,
    });
    prisma.consultation.create.mockResolvedValue({
      id: 'consultation-1',
      contact: { id: contactId, phones: [] },
    });

    await service.create('office-1', 'user-1', {
      contactId,
      type: 'phone',
      content: '의뢰 확인 상담',
      listingIntakeId: intakeId,
    });

    expect(prisma.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: intakePropertyId,
          listingIntakeId: intakeId,
        }),
      }),
    );

    await expect(
      service.create('office-1', 'user-1', {
        contactId,
        type: 'phone',
        content: '어긋난 호실 지정',
        propertyId: otherPropertyId,
        listingIntakeId: intakeId,
      }),
    ).rejects.toThrow('고른 의뢰가 고른 매물에 속해 있지 않습니다.');
  });

  it('BuyerIntake 참여자가 아닌 연락처의 상담 연결을 거부한다', async () => {
    const { prisma, service } = createService();
    prisma.contact.findFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    prisma.buyerIntake.findFirst.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' });
    prisma.buyerIntakeContact.findFirst.mockResolvedValue(null);

    await expect(
      service.create('office-1', 'user-1', {
        contactId: '11111111-1111-4111-8111-111111111111',
        type: 'phone',
        content: '참여자가 아닌 연락처',
        buyerIntakeId: '22222222-2222-4222-8222-222222222222',
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

  it('방문 상담 녹음은 visit으로 저장한다 (자동 상담 기록이 방문 상담이 된다)', async () => {
    expect(recordingDirection('visit', 'outbound')).toBe('visit');
    expect(recordingDirection('phone', 'outbound')).toBe('outbound');
    expect(recordingDirection(undefined, undefined)).toBe('inbound');

    const { prisma, callIntelligence, service } = createService();
    prisma.callRecording.create.mockResolvedValue({ id: 'recording-1', sttStatus: 'processing', fileName: 'visit.m4a', fileSize: 10 });
    await service.createWithRecording(
      'office-1',
      'user-1',
      { type: 'visit', direction: 'inbound', phoneNumber: '' },
      { originalname: 'visit.m4a', size: 10, buffer: Buffer.from('') } as Express.Multer.File,
    );
    expect(prisma.callRecording.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ direction: 'visit', sttStatus: 'processing' }),
    });
    expect(callIntelligence.startTranscription).toHaveBeenCalledWith('recording-1', expect.anything());
  });

  it('연결 대기: 녹음이 있는데 상담 기록이 없는 것만 고른다', async () => {
    const { prisma, service } = createService();
    prisma.callRecording.findMany.mockResolvedValue([]);
    prisma.callRecording.count.mockResolvedValue(0);

    await service.findRecordings('office-1', { unlinked: true });

    expect(prisma.callRecording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ officeId: 'office-1' }, { fileName: { not: null }, consultations: { none: {} } }],
        },
      }),
    );
  });
  it('filters by recording and sends only a recording summary with each consultation', async () => {
    const { prisma, service } = createService();
    prisma.consultation.findMany.mockResolvedValue([
      {
        id: 'c-1',
        contact: { id: '11111111-1111-4111-8111-111111111111', name: '김소유', phones: [] },
        callRecording: {
          id: 'rec-1',
          direction: 'visit',
          durationSec: 754,
          fileName: 'visit.m4a',
          sttStatus: 'completed',
          analysisStatus: 'completed',
          analysis: {
            summary: '전세 만기 전 매도 의사',
            keyPoints: ['긴 내용'],
            consultationContent: '전세 만기 전 매도 의사\n핵심: 3월 만기',
          },
          autoConsultationId: 'c-1',
          _count: { suggestions: 2 },
        },
        // 사람이 자동 기록 뒤에 메모를 덧붙였다
        content: '전세 만기 전 매도 의사\n핵심: 3월 만기\n(직접 추가) 세입자와 통화 필요',
      },
      { id: 'c-2', contact: null, callRecording: null },
      {
        id: 'c-3',
        contact: null,
        content: '요약\n핵심',
        callRecording: {
          id: 'rec-3',
          direction: 'inbound',
          durationSec: 10,
          fileName: 'a.m4a',
          sttStatus: 'completed',
          analysisStatus: 'completed',
          analysis: { summary: '요약', consultationContent: '요약\n핵심' },
          autoConsultationId: 'c-3',
          _count: { suggestions: 0 },
        },
      },
    ]);
    prisma.consultation.count.mockResolvedValue(3);

    const result = await service.findAll('office-1', { recording: 'with' });

    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ officeId: 'office-1' }, { callRecordingId: { not: null } }] },
      }),
    );
    // 받아쓰기 전문·분석 전체는 목록에 싣지 않는다
    expect(result.items[0].callRecording).toEqual({
      id: 'rec-1',
      direction: 'visit',
      durationSec: 754,
      hasFile: true,
      sttStatus: 'completed',
      analysisStatus: 'completed',
      summary: '전세 만기 전 매도 의사',
      pendingSuggestionCount: 2,
      // 고친 글은 사람의 글이다 (자동 기록으로 시작해도)
      contentIsAuto: false,
    });
    expect(result.items[1].callRecording).toBeNull();
    // 분석이 쓴 그대로일 때만 자동 기록으로 친다
    expect(result.items[2].callRecording?.contentIsAuto).toBe(true);

    // 작업 요청: 처리하지 않은 제안이 있는 상담만
    await service.findAll('office-1', { suggestions: 'pending' });
    expect(prisma.consultation.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { officeId: 'office-1' },
            { callRecording: { suggestions: { some: { status: 'pending' } } } },
          ],
        },
      }),
    );

    await service.findAll('office-1', { recording: 'without' });
    expect(prisma.consultation.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { AND: [{ officeId: 'office-1' }, { callRecordingId: null }] },
      }),
    );
  });

  describe('attachRecordingToConsultation', () => {
    const file = { originalname: 'visit.m4a', size: 2048 } as Express.Multer.File;

    function createAttachService(linkedCount: number) {
      const context = createService();
      const tx = {
        consultation: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'c-1',
            type: 'visit',
            contactId: '11111111-1111-4111-8111-111111111111',
            createdAt: new Date('2026-11-10T05:00:00.000Z'),
            contact: { phones: [{ phone: '01012345678', isPrimary: true }] },
          }),
          updateMany: jest.fn().mockResolvedValue({ count: linkedCount }),
        },
        callRecording: {
          create: jest.fn().mockResolvedValue({
            id: 'rec-1',
            sttStatus: 'processing',
            fileName: 'visit.m4a',
            fileSize: 2048,
          }),
        },
      };
      (context.prisma as Record<string, unknown>).$transaction = jest.fn(
        (run: (client: typeof tx) => unknown) => run(tx),
      );
      return { ...context, tx };
    }

    it('adds a recording to a written consultation without making a second consultation', async () => {
      const { service, tx, callIntelligence } = createAttachService(1);

      const result = await service.attachRecordingToConsultation(
        'c-1',
        'office-1',
        'user-1',
        { durationSec: 600 },
        file,
      );

      expect(tx.callRecording.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          officeId: 'office-1',
          contactId: '11111111-1111-4111-8111-111111111111',
          direction: 'visit',
          phoneNumber: '01012345678',
          durationSec: 600,
          // 상담한 시각에 놓는다
          calledAt: new Date('2026-11-10T05:00:00.000Z'),
          // 분석이 상담을 새로 만들지 않고 이 상담을 쓴다
          autoConsultationId: 'c-1',
        }),
      });
      // 비어 있을 때만 연결한다
      expect(tx.consultation.updateMany).toHaveBeenCalledWith({
        where: { id: 'c-1', officeId: 'office-1', callRecordingId: null },
        data: { callRecordingId: 'rec-1' },
      });
      expect(callIntelligence.startTranscription).toHaveBeenCalledWith('rec-1', file);
      expect(result.consultation).toEqual({ id: 'c-1' });
    });

    it('refuses a second recording and does not start transcription', async () => {
      const { service, callIntelligence } = createAttachService(0);

      await expect(
        service.attachRecordingToConsultation('c-1', 'office-1', 'user-1', {}, file),
      ).rejects.toThrow('이미 녹음이 붙어 있는 상담입니다');
      expect(callIntelligence.startTranscription).not.toHaveBeenCalled();
    });

    it('requires a file', async () => {
      const { service } = createAttachService(1);
      await expect(
        service.attachRecordingToConsultation(
          'c-1',
          'office-1',
          'user-1',
          {},
          undefined as unknown as Express.Multer.File,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
