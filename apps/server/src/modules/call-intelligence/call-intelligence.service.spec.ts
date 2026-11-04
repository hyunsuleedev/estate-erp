import { CallIntelligenceService } from './call-intelligence.service';
import * as geminiAnalyze from './analysis/gemini-analyze';
import * as callContext from './analysis/call-context';

const calledAt = new Date('2026-11-02T05:30:00.000Z');

function recording(overrides: Record<string, unknown> = {}) {
  return {
    id: 'recording-1',
    officeId: 'office-1',
    userId: 'agent-1',
    contactId: 'contact-1',
    direction: 'inbound',
    durationSec: 120,
    calledAt,
    analysis: null,
    autoConsultationId: null,
    messages: [
      { speaker: 0, text: '내일 세 시에 보러 갈게요', seq: 0 },
      { speaker: 1, text: '네 내일 세 시에 뵙겠습니다', seq: 1 },
    ],
    ...overrides,
  };
}

function setup(current: ReturnType<typeof recording>) {
  const tx = {
    callRecording: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    consultation: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'consultation-new' }),
    },
    callRecordingMessage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    callActionSuggestion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    callRecording: {
      update: jest.fn().mockResolvedValue(current),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    callActionSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { prisma, tx, service: new CallIntelligenceService(prisma as never) };
}

const ANALYSIS = {
  summary: '손님이 내일 오후 3시 임장을 잡았다.',
  keyPoints: ['내일 15시 임장'],
  agentSpeaker: 1,
  suggestions: [
    {
      type: 'calendar_event',
      title: '내일 15시 임장',
      evidence: '내일 세 시에 보러 갈게요',
      data: { title: '홍길동님 임장', start: '2026-11-03T15:00', eventType: 'viewing' },
    },
  ],
};

describe('CallIntelligenceService.analyze', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    jest.spyOn(callContext, 'buildCallContext').mockResolvedValue({
      contactId: 'contact-1',
      contactName: '홍길동',
      refs: new Map(),
      openMatchKeys: new Set(),
      text: '',
    });
    jest.spyOn(geminiAnalyze, 'generateAnalysisJson').mockResolvedValue(ANALYSIS);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.GEMINI_API_KEY = originalKey;
  });

  it('writes the consultation at the call time, labels speakers, and stores suggestions', async () => {
    const { service, tx } = setup(recording());

    await service.analyze('recording-1');

    expect(tx.consultation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: 'office-1',
        contactId: 'contact-1',
        createdById: 'agent-1',
        type: 'phone',
        purpose: 'general',
        callRecordingId: 'recording-1',
        createdAt: calledAt,
        content: '손님이 내일 오후 3시 임장을 잡았다.\n· 내일 15시 임장',
      }),
      select: { id: true },
    });
    expect(tx.callRecording.update).toHaveBeenCalledWith({
      where: { id: 'recording-1' },
      data: { autoConsultationId: 'consultation-new' },
    });
    expect(tx.callRecordingMessage.updateMany).toHaveBeenCalledWith({
      where: { recordingId: 'recording-1', speaker: 1, speakerLabel: null },
      data: { speakerLabel: '나' },
    });
    expect(tx.callActionSuggestion.deleteMany).toHaveBeenCalledWith({
      where: { recordingId: 'recording-1', status: 'pending' },
    });
    // 분석하던 사이 통화 상대가 바뀌었으면 저장하지 않는다
    expect(tx.callRecording.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'recording-1', analysisRunId: expect.any(String), contactId: 'contact-1' },
      }),
    );
    expect(tx.callActionSuggestion.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          consultationId: 'consultation-new',
          contactId: 'contact-1',
          type: 'calendar_event',
          payload: expect.objectContaining({ start: '2026-11-03T15:00:00+09:00', eventType: 'viewing' }),
        }),
      ],
    });
  });

  it('discards the result when a newer analysis started meanwhile', async () => {
    const { service, tx } = setup(recording());
    tx.callRecording.updateMany.mockResolvedValue({ count: 0 });

    await service.analyze('recording-1');

    expect(tx.consultation.create).not.toHaveBeenCalled();
    expect(tx.callActionSuggestion.createMany).not.toHaveBeenCalled();
  });

  it('updates its own consultation on reanalysis but keeps one a person edited', async () => {
    const previous = { consultationContent: '이전 요약' };

    const untouched = setup(recording({ analysis: previous, autoConsultationId: 'consultation-1' }));
    untouched.tx.consultation.findFirst.mockResolvedValue({ id: 'consultation-1', content: '이전 요약', contactId: 'contact-1' });
    await untouched.service.analyze('recording-1');
    expect(untouched.tx.consultation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'consultation-1' } }),
    );
    expect(untouched.tx.consultation.create).not.toHaveBeenCalled();

    const edited = setup(recording({ analysis: previous, autoConsultationId: 'consultation-1' }));
    edited.tx.consultation.findFirst.mockResolvedValue({
      id: 'consultation-1',
      content: '사람이 고친 요약',
      contactId: 'contact-1',
    });
    await edited.service.analyze('recording-1');
    expect(edited.tx.consultation.update).not.toHaveBeenCalled();
    expect(edited.tx.callActionSuggestion.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ consultationId: 'consultation-1' })],
    });
  });

  it('keeps the previous analysis and records the error when analysis fails', async () => {
    const { service, prisma } = setup(recording({ analysis: { summary: '지난 요약' } }));
    jest.spyOn(geminiAnalyze, 'generateAnalysisJson').mockRejectedValue(new Error('quota exceeded'));

    await service.analyze('recording-1');

    expect(prisma.callRecording.updateMany).toHaveBeenCalledWith({
      where: { id: 'recording-1', analysisRunId: expect.any(String) },
      data: { analysisStatus: 'failed', analysis: { summary: '지난 요약', error: 'quota exceeded' } },
    });
  });

  it('moves an edited auto consultation to the corrected caller without overwriting its text', async () => {
    const previous = { consultationContent: '이전 요약' };
    const { service, tx } = setup(
      recording({ analysis: previous, autoConsultationId: 'consultation-1', contactId: 'contact-B' }),
    );
    tx.consultation.findFirst.mockResolvedValue({
      id: 'consultation-1',
      content: '사람이 고친 요약',
      contactId: 'contact-A',
    });

    await service.analyze('recording-1');

    const update = tx.consultation.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'consultation-1' });
    expect(update.data).toMatchObject({ contactId: 'contact-B' });
    expect(update.data).not.toHaveProperty('content');
  });
});
