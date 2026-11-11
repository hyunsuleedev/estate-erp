import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { audioMimeTypeFromFileName, CallSuggestionStatus } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildCallContext, describeSuggestionTargets } from './analysis/call-context';
import {
  buildAnalysisPrompt,
  SYSTEM_INSTRUCTION,
} from './analysis/call-analysis.prompt';
import {
  buildConsultationContent,
  type ParsedCallAnalysis,
  parseCallAnalysis,
  stripEvidenceLines,
} from './analysis/call-analysis.parser';
import {
  DEFAULT_GEMINI_ANALYSIS_MODEL,
  generateAnalysisJson,
} from './analysis/gemini-analyze';
import {
  DEFAULT_GEMINI_TRANSCRIBE_MODEL,
  transcribeWithGemini,
} from './stt/gemini-transcribe';
import type { SttProvider, TranscriptUtterance } from './stt/stt.types';
import { transcribeWithVito } from './stt/vito-transcribe';

/**
 * 통화 녹음 → 받아쓰기 → 분석 → 상담 기록 + 업무 제안.
 *
 * - 받아쓰기: Gemini 3.5 Transcribe (기본). STT_PROVIDER=vito면 리턴제로.
 * - 분석: Gemini. 사무소 데이터(상대방의 매물·구매 요청·매칭)를 함께 넘겨
 *   상담 요약과 제안을 받는다.
 * - 상담 기록은 연락처가 있으면 자동으로 남긴다(위험이 낮음).
 * - 할 일·일정·고객 요청·매칭·매물 확인은 제안으로만 저장하고 사람이 반영한다.
 */

interface StoredAnalysis {
  consultationContent?: string | null;
  [key: string]: unknown;
}

type RecordingForAnalysis = Prisma.CallRecordingGetPayload<{
  include: { messages: { orderBy: { seq: 'asc' } } };
}>;

@Injectable()
export class CallIntelligenceService {
  private readonly logger = new Logger(CallIntelligenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 받아쓰기 업체: STT_PROVIDER가 있으면 그대로, 없으면 설정된 키를 보고 고른다. */
  resolveSttProvider(): SttProvider {
    const explicit = process.env.STT_PROVIDER?.trim().toLowerCase();
    if (explicit === 'gemini' || explicit === 'vito' || explicit === 'dummy') return explicit;
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.VITO_CLIENT_ID && process.env.VITO_CLIENT_SECRET) return 'vito';
    return 'dummy';
  }

  /** 받아쓰기를 백그라운드로 시작한다. 끝나면 분석까지 이어서 한다. */
  startTranscription(recordingId: string, file: Express.Multer.File) {
    void this.transcribe(recordingId, file).catch((error) => {
      this.logger.error(`Transcription crashed for ${recordingId}: ${errorMessage(error)}`);
    });
  }

  async transcribe(recordingId: string, file: Express.Multer.File) {
    const provider = this.resolveSttProvider();
    await this.prisma.callRecording.update({
      where: { id: recordingId },
      data: { sttStatus: 'processing', sttProvider: provider, sttError: null },
    });

    let utterances: TranscriptUtterance[];
    try {
      utterances = await this.runStt(provider, file);
    } catch (error) {
      const message = errorMessage(error);
      this.logger.error(`STT failed for ${recordingId} (${provider}): ${message}`);
      await this.prisma.callRecording
        .update({
          where: { id: recordingId },
          data: { sttStatus: 'failed', sttError: message.slice(0, 500) },
        })
        .catch(() => undefined);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // 예전 분석의 근거 줄은 예전 받아쓰기의 줄 번호라 새 받아쓰기에서는 엉뚱한 줄을 가리킨다.
      // 먼저 runId를 바꿔 행을 잠근다: 예전 받아쓰기로 돌던 분석은 이후 저장하지 못하고,
      // 이미 저장을 끝낸 분석은 잠금이 풀린 뒤의 최신 값으로 돌려받는다.
      // 그 최신 분석에서 줄 번호만 지워 저장한다 (상담 기록 비교용 consultationContent 등은 그대로 둔다).
      // 새 분석이 실패해도 예전 요약은 남지만 잘못된 원문으로 안내하지는 않는다.
      const locked = await tx.callRecording.update({
        where: { id: recordingId },
        data: { analysisRunId: randomUUID() },
        select: { analysis: true },
      });

      await tx.callRecordingMessage.deleteMany({ where: { recordingId } });
      await tx.callRecordingMessage.createMany({
        data: utterances.map((utterance, index) => ({
          recordingId,
          speaker: utterance.speaker,
          text: utterance.text,
          startMs: utterance.startMs,
          endMs: utterance.endMs,
          seq: index,
        })),
      });
      await tx.callRecording.update({
        where: { id: recordingId },
        data: {
          sttStatus: 'completed',
          sttError: null,
          ...(locked.analysis
            ? { analysis: stripEvidenceLines(locked.analysis) as Prisma.InputJsonValue }
            : {}),
        },
      });
      // 통화 길이를 모르고 올린 녹음은 받아쓰기 시각으로 채운다
      await tx.callRecording.updateMany({
        where: { id: recordingId, durationSec: 0 },
        data: {
          durationSec: Math.ceil(Math.max(0, ...utterances.map((utterance) => utterance.endMs)) / 1000),
        },
      });
    });
    this.logger.log(`STT completed: ${recordingId} (${provider}, ${utterances.length} utterances)`);

    if (utterances.length > 0) await this.analyze(recordingId);
  }

  private async runStt(provider: SttProvider, file: Express.Multer.File) {
    if (provider === 'dummy') return dummyUtterances(file);
    const mimeType = audioMimeTypeFromFileName(file.originalname, file.mimetype);
    if (!mimeType) {
      throw new Error('지원하지 않는 녹음 형식입니다 (m4a, mp3, wav, aac, ogg 등을 올려 주세요)');
    }
    const audio = { buffer: file.buffer, fileName: file.originalname, mimeType };
    if (provider === 'vito') {
      const clientId = process.env.VITO_CLIENT_ID;
      const clientSecret = process.env.VITO_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('VITO 키가 설정되지 않았습니다');
      return transcribeWithVito(audio, { clientId, clientSecret });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다');
    return transcribeWithGemini(audio, {
      apiKey,
      model: process.env.GEMINI_TRANSCRIBE_MODEL || DEFAULT_GEMINI_TRANSCRIBE_MODEL,
      wordTimestamps: process.env.GEMINI_STT_WORD_TIMESTAMPS === 'true',
    });
  }

  /** 제안 카드에 보여줄 대상 이름 */
  describeSuggestionTargets(officeId: string, payloads: unknown[]) {
    return describeSuggestionTargets(this.prisma, officeId, payloads);
  }

  /** 다시 분석 (받아쓰기는 그대로 두고 분석만). 연락처를 연결한 뒤에도 쓴다. */
  async requestReanalysis(recordingId: string, officeId: string) {
    const recording = await this.prisma.callRecording.findFirst({
      where: { id: recordingId, officeId },
      select: { id: true, sttStatus: true, _count: { select: { messages: true } } },
    });
    if (!recording) throw new NotFoundException('Recording not found');
    if (recording.sttStatus !== 'completed' || recording._count.messages === 0) {
      throw new BadRequestException('받아쓰기가 끝난 통화만 다시 분석할 수 있습니다');
    }
    if (!process.env.GEMINI_API_KEY) {
      throw new BadRequestException('GEMINI_API_KEY가 설정되지 않아 분석할 수 없습니다');
    }
    await this.prisma.callRecording.update({
      where: { id: recordingId },
      data: { analysisStatus: 'processing' },
    });
    void this.analyze(recordingId).catch((error) => {
      this.logger.error(`Reanalysis crashed for ${recordingId}: ${errorMessage(error)}`);
    });
    return { id: recordingId, analysisStatus: 'processing' as const };
  }

  /**
   * 분석. 여러 번 겹쳐 실행되면 가장 나중에 시작한 분석의 결과만 저장한다(analysisRunId).
   */
  async analyze(recordingId: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    const runId = randomUUID();
    const recording = await this.prisma.callRecording.update({
      where: { id: recordingId },
      data: { analysisRunId: runId, analysisStatus: apiKey ? 'processing' : 'none' },
      include: { messages: { orderBy: { seq: 'asc' } } },
    });
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured, skipping call analysis');
      return;
    }
    if (recording.messages.length === 0) {
      await this.prisma.callRecording.updateMany({
        where: { id: recordingId, analysisRunId: runId },
        data: { analysisStatus: 'none' },
      });
      return;
    }

    const model = process.env.GEMINI_ANALYSIS_MODEL || DEFAULT_GEMINI_ANALYSIS_MODEL;
    try {
      const context = await buildCallContext(this.prisma, {
        officeId: recording.officeId,
        contactId: recording.contactId,
      });
      const resolvedSuggestions = await this.prisma.callActionSuggestion.findMany({
        where: {
          recordingId,
          status: { in: [CallSuggestionStatus.ACCEPTED, CallSuggestionStatus.DISMISSED] },
        },
        orderBy: { seq: 'asc' },
        select: { type: true, title: true, status: true },
      });
      const raw = await generateAnalysisJson({
        apiKey,
        model,
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: buildAnalysisPrompt({
          calledAt: recording.calledAt,
          direction: recording.direction,
          durationSec: recording.durationSec,
          contactName: context.contactName,
          utterances: recording.messages,
          contextText: context.text,
          resolvedSuggestions,
        }),
      });
      const speakers = [...new Set(recording.messages.map((message) => message.speaker))];
      const parsed = parseCallAnalysis(
        raw,
        context,
        speakers,
        recording.messages.map((message) => message.seq),
      );
      if (parsed.dropped.length > 0) {
        this.logger.log(
          `Dropped ${parsed.dropped.length} suggestion(s) for ${recordingId}: ${parsed.dropped
            .map((item) => `${item.type}(${item.reason})`)
            .join(', ')}`,
        );
      }
      await this.persistAnalysis(recording, runId, parsed, model);
    } catch (error) {
      const message = errorMessage(error);
      this.logger.error(`Call analysis failed for ${recordingId}: ${message}`);
      // 이전에 성공한 분석은 남기고 오류만 덧붙인다
      const previous = (recording.analysis as StoredAnalysis | null) ?? {};
      await this.prisma.callRecording
        .updateMany({
          where: { id: recordingId, analysisRunId: runId },
          data: {
            analysisStatus: 'failed',
            analysis: { ...previous, error: message.slice(0, 500) } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
    }
  }

  private async persistAnalysis(
    recording: RecordingForAnalysis,
    runId: string,
    parsed: ParsedCallAnalysis,
    model: string,
  ) {
    const previous = (recording.analysis as StoredAnalysis | null) ?? null;
    const consultationContent = buildConsultationContent(parsed);

    await this.prisma.$transaction(async (tx) => {
      // 이 분석이 아직 최신이고 분석하던 사이 통화 상대가 바뀌지 않았을 때만 저장한다
      // (행 잠금이 커밋까지 유지돼 뒤이은 분석·연락처 변경은 기다린다)
      const claimed = await tx.callRecording.updateMany({
        where: { id: recording.id, analysisRunId: runId, contactId: recording.contactId },
        data: {
          analysisStatus: 'completed',
          analyzedAt: new Date(),
          analysis: {
            summary: parsed.summary,
            keyPoints: parsed.keyPoints,
            // 근거 줄(받아쓰기 seq)이 붙은 항목 — 화면에서 원문으로 이동한다
            points: parsed.points,
            facts: parsed.facts,
            checks: parsed.checks,
            customerNeed: parsed.customerNeed,
            callType: parsed.callType,
            sentiment: parsed.sentiment,
            agentSpeaker: parsed.agentSpeaker,
            // 기존 화면 호환: 제안 제목 목록
            nextActions: parsed.suggestions.map((suggestion) => suggestion.title),
            consultationContent: recording.contactId ? consultationContent : null,
            model,
          } as Prisma.InputJsonValue,
        },
      });
      if (claimed.count === 0) return;

      const consultationId = recording.contactId
        ? await this.upsertAutoConsultation(tx, recording, parsed, consultationContent, previous)
        : null;

      if (parsed.agentSpeaker !== null) {
        // 사람이 고친 화자 이름은 그대로 둔다
        await tx.callRecordingMessage.updateMany({
          where: { recordingId: recording.id, speaker: parsed.agentSpeaker, speakerLabel: null },
          data: { speakerLabel: '나' },
        });
        await tx.callRecordingMessage.updateMany({
          where: { recordingId: recording.id, speaker: { not: parsed.agentSpeaker }, speakerLabel: null },
          data: { speakerLabel: '고객' },
        });
      }

      // 반영·무시한 제안은 남기고, 아직 처리하지 않은 제안만 새 분석으로 바꾼다
      await tx.callActionSuggestion.deleteMany({
        where: { recordingId: recording.id, status: CallSuggestionStatus.PENDING },
      });
      if (parsed.suggestions.length > 0) {
        await tx.callActionSuggestion.createMany({
          data: parsed.suggestions.map((suggestion, index) => ({
            officeId: recording.officeId,
            recordingId: recording.id,
            consultationId,
            // 반영할 때 통화 상대가 그대로인지 확인한다
            contactId: recording.contactId,
            type: suggestion.type,
            title: suggestion.title,
            evidence: suggestion.evidence,
            payload: suggestion.payload as unknown as Prisma.InputJsonValue,
            seq: index,
          })),
        });
      }
    });
  }

  /**
   * 통화 상담 기록을 만들거나 고친다.
   * 다시 분석할 때 사람이 고친 상담 기록(지난 분석이 쓴 내용과 다름)은 덮어쓰지 않는다.
   */
  private async upsertAutoConsultation(
    tx: Prisma.TransactionClient,
    recording: RecordingForAnalysis,
    parsed: ParsedCallAnalysis,
    content: string,
    previous: StoredAnalysis | null,
  ): Promise<string> {
    const contactId = recording.contactId!;
    // 상담 대상과 맥락 연결 (통화 상대가 바뀌면 함께 바뀐다)
    const target = {
      contactId,
      purpose: parsed.links.buyerReqId ? 'buyer_consult' : 'general',
      propertyId: parsed.links.propertyId,
      listingIntakeId: parsed.links.listingIntakeId,
      listingId: parsed.links.listingId,
      matchId: parsed.links.matchId,
      buyerIntakeId: parsed.links.buyerIntakeId,
      buyerReqId: parsed.links.buyerReqId,
    };
    const data = { ...target, content };

    if (recording.autoConsultationId) {
      const existing = await tx.consultation.findFirst({
        where: { id: recording.autoConsultationId, officeId: recording.officeId },
        select: { id: true, content: true, contactId: true },
      });
      if (existing) {
        const untouched =
          typeof previous?.consultationContent === 'string' &&
          existing.content === previous.consultationContent;
        if (untouched) {
          await tx.consultation.update({ where: { id: existing.id }, data });
        } else if (existing.contactId !== contactId) {
          // 통화 상대를 바로잡았으면 사람이 고친 내용은 두고 상담 대상과 연결만 새 상대로 옮긴다
          await tx.consultation.update({ where: { id: existing.id }, data: target });
        }
        return existing.id;
      }
    }

    const created = await tx.consultation.create({
      data: {
        ...data,
        officeId: recording.officeId,
        createdById: recording.userId,
        // 방문 상담 녹음은 방문 상담으로 남긴다
        type: recording.direction === 'visit' ? 'visit' : 'phone',
        callRecordingId: recording.id,
        // 상담 흐름에서 통화한 시각에 보이도록
        createdAt: recording.calledAt,
      },
      select: { id: true },
    });
    await tx.callRecording.update({
      where: { id: recording.id },
      data: { autoConsultationId: created.id },
    });
    return created.id;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** 받아쓰기 키가 없는 개발 환경용 */
function dummyUtterances(file: Express.Multer.File): TranscriptUtterance[] {
  return [
    { speaker: 0, text: '여보세요, 거기 부동산이죠?', startMs: 0, endMs: 3000 },
    { speaker: 1, text: '네 안녕하세요, 공인중개사입니다.', startMs: 3000, endMs: 6500 },
    {
      speaker: 0,
      text: `[개발용 받아쓰기] 파일: ${file.originalname} (${Math.round(file.size / 1024)}KB)`,
      startMs: 6500,
      endMs: 10000,
    },
  ];
}
