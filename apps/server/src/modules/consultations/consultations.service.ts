import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import FormData = require('form-data');

export interface ConsultationSearchQuery {
  q?: string;
  contactId?: string;
  propertyId?: string;
  siteId?: string;
  dongId?: string;
  unitId?: string;
  listingIntakeId?: string;
  listingId?: string;
  matchId?: string;
  buyerReqId?: string;
  context?: 'property' | 'listingIntake' | 'listing' | 'match' | 'buyerRequirement' | 'unlinked';
  outcome?: 'actionRequired' | 'confirmed' | 'held';
  type?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly defaultInclude = {
    contact: { select: { id: true, name: true, phone: true } },
    property: {
      // NOTE: Property 모델에는 memo 필드가 schema상 존재하지 않음 (docs/DATA_STRUCTURE.md와 불일치).
      // 별도 task로 추적 중. schema 기준으로 select 제한.
      select: {
        id: true,
        site: { select: { name: true } },
        unit: {
          select: {
            id: true,
            name: true,
            floor: true,
            lineNo: true,
            dong: { select: { id: true, name: true, isPlaceholder: true } },
          },
        },
      },
    },
    listingIntake: {
      select: {
        id: true,
        status: true,
        propertyId: true,
        receivedAt: true,
      },
    },
    listing: { select: { id: true, transactionType: true, price: true, checkStatus: true } },
    match: { select: { id: true, stage: true } },
    buyerRequirement: { select: { id: true, status: true, transactionType: true } },
    createdBy: { select: { id: true, name: true } },
  };

  async findAll(officeId: string, query: ConsultationSearchQuery = {}) {
    const filters: Prisma.ConsultationWhereInput[] = [{ officeId }];

    if (query.contactId) filters.push({ contactId: query.contactId });
    if (query.propertyId) filters.push({ propertyId: query.propertyId });
    if (query.siteId) filters.push({ property: { siteId: query.siteId } });
    if (query.dongId) filters.push({ property: { unit: { dongId: query.dongId } } });
    if (query.unitId) filters.push({ property: { unitId: query.unitId } });
    if (query.listingIntakeId) filters.push({ listingIntakeId: query.listingIntakeId });
    if (query.listingId) filters.push({ listingId: query.listingId });
    if (query.matchId) filters.push({ matchId: query.matchId });
    if (query.buyerReqId) filters.push({ buyerReqId: query.buyerReqId });
    if (query.type) filters.push({ type: query.type });
    if (query.createdById) filters.push({ createdById: query.createdById });

    if (query.context) {
      filters.push(this.buildContextFilter(query.context));
    }

    if (query.outcome) {
      filters.push(this.buildOutcomeFilter(query.outcome));
    }

    if (query.dateFrom || query.dateTo) {
      filters.push({
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      });
    }

    const q = query.q?.trim();
    if (q) {
      filters.push({
        OR: [
          { content: { contains: q, mode: 'insensitive' } },
          { contact: { name: { contains: q, mode: 'insensitive' } } },
          { contact: { phone: { contains: q, mode: 'insensitive' } } },
          { contact: { phones: { some: { normalizedPhone: { contains: q.replace(/[\s\-()]/g, '') } } } } },
          { property: { site: { name: { contains: q, mode: 'insensitive' } } } },
          { property: { unit: { name: { contains: q, mode: 'insensitive' } } } },
          { property: { unit: { dong: { name: { contains: q, mode: 'insensitive' } } } } },
          { listing: { transactionType: { contains: q, mode: 'insensitive' } } },
          { listing: { memo: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const where =
      filters.length === 1 ? filters[0] : ({ AND: filters } as Prisma.ConsultationWhereInput);
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.consultation.findMany({
        where,
        include: this.defaultInclude,
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.consultation.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private buildContextFilter(context: NonNullable<ConsultationSearchQuery['context']>): Prisma.ConsultationWhereInput {
    if (context === 'property') return { propertyId: { not: null } };
    if (context === 'listingIntake') return { listingIntakeId: { not: null } };
    if (context === 'listing') return { listingId: { not: null } };
    if (context === 'match') return { matchId: { not: null } };
    if (context === 'buyerRequirement') return { buyerReqId: { not: null } };
    return {
      propertyId: null,
      listingIntakeId: null,
      listingId: null,
      matchId: null,
      buyerReqId: null,
    };
  }

  private buildOutcomeFilter(outcome: NonNullable<ConsultationSearchQuery['outcome']>): Prisma.ConsultationWhereInput {
    const keywords =
      outcome === 'actionRequired'
        ? ['필요', '요청', '문의', '어떻게', '여부']
        : outcome === 'confirmed'
          ? ['확정', '수락', '입금 확인', '완료', '결정']
          : ['거절', '취소', '보류', '불가'];

    return {
      OR: keywords.map((keyword) => ({
        content: { contains: keyword, mode: 'insensitive' },
      })),
    };
  }

  async findOne(id: string, officeId: string) {
    const consultation = await this.prisma.consultation.findFirst({
      where: { id, officeId },
      include: this.defaultInclude,
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    return consultation;
  }

  async create(
    officeId: string,
    userId: string,
    dto: {
	      contactId: string;
	      type: string;
	      purpose?: string;
	      content: string;
      propertyId?: string;
      listingIntakeId?: string;
      listingId?: string;
      matchId?: string;
      buyerReqId?: string;
    },
  ) {
    const { propertyId, listingIntakeId, listingId, matchId, buyerReqId, ...rest } = dto;
    return this.prisma.consultation.create({
      data: {
        officeId,
        createdById: userId,
        ...rest,
        propertyId: propertyId || undefined,
        listingIntakeId: listingIntakeId || undefined,
        listingId: listingId || undefined,
        matchId: matchId || undefined,
        buyerReqId: buyerReqId || undefined,
      },
      include: this.defaultInclude,
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      type?: string;
      content?: string;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.consultation.update({
      where: { id },
      data: dto,
      include: this.defaultInclude,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.consultation.delete({ where: { id } });
  }

  async getRecent(officeId: string, limit = 10) {
    return this.prisma.consultation.findMany({
      where: { officeId },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ================================================================
  // CallRecording + STT
  // ================================================================

  /**
   * 녹음 파일 업로드 → CallRecording 생성 → 비동기 VITO STT
   */
  async createWithRecording(
    officeId: string,
    userId: string,
    dto: {
      contactId: string;
      type: string;
      direction?: string;
      phoneNumber?: string;
      durationSec?: number;
    },
    file: Express.Multer.File,
  ) {
    // 1. CallRecording 생성
    const recording = await this.prisma.callRecording.create({
      data: {
        officeId,
        userId,
        contactId: dto.contactId,
        direction: dto.direction || 'inbound',
        phoneNumber: dto.phoneNumber || '',
        durationSec: dto.durationSec || 0,
        fileName: file.originalname,
        fileSize: file.size,
        sttStatus: 'processing',
        calledAt: new Date(),
      },
    });

    // 2. 비동기 STT 처리 시작
    this.processSTT(recording.id, officeId, file);

    return {
      recording: {
        id: recording.id,
        sttStatus: recording.sttStatus,
        fileName: recording.fileName,
        fileSize: recording.fileSize,
      },
      // 하위 호환: 기존 앱이 consultation 필드를 기대하므로
      consultation: { id: recording.id, content: '[녹음 분석 중...]' },
      sttStatus: 'processing',
      recordingFileName: file.originalname,
      recordingSize: file.size,
    };
  }

  /**
   * CallRecording의 STT 상태 + 메시지 조회
   */
  async getSttStatus(id: string, officeId: string) {
    // CallRecording에서 먼저 찾기
    const recording = await this.prisma.callRecording.findFirst({
      where: { id, officeId },
      include: {
        messages: { orderBy: { seq: 'asc' } },
      },
    });

    if (recording) {
      const textContent = recording.messages.length > 0
        ? recording.messages
            .map(m => `${m.speakerLabel || `화자${m.speaker + 1}`}: ${m.text}`)
            .join('\n')
        : '';

      return {
        id: recording.id,
        sttStatus: recording.sttStatus,
        analysisStatus: recording.analysisStatus,
        analysis: recording.analysis,
        content: textContent,
        messages: recording.messages.map(m => ({
          speaker: m.speaker,
          speakerLabel: m.speakerLabel,
          text: m.text,
          startMs: m.startMs,
          endMs: m.endMs,
          seq: m.seq,
        })),
      };
    }

    // 하위 호환: 기존 consultation ID로 조회 시도
    const consultation = await this.prisma.consultation.findFirst({
      where: { id, officeId },
      select: { id: true, content: true },
    });
    if (!consultation) throw new NotFoundException('Recording not found');

    return {
      id: consultation.id,
      sttStatus: consultation.content.startsWith('[녹음 분석 중')
        ? 'processing'
        : 'completed',
      content: consultation.content,
      messages: [],
    };
  }

  /**
   * CallRecording 목록 조회
   */
  async findRecordings(officeId: string, query: { contactId?: string; page?: number; limit?: number } = {}) {
    const where: Prisma.CallRecordingWhereInput = { officeId };
    if (query.contactId) where.contactId = query.contactId;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.callRecording.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true } },
          messages: { orderBy: { seq: 'asc' } },
          _count: { select: { messages: true } },
        },
        orderBy: { calledAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.callRecording.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * CallRecording 1건 상세 (메시지 포함)
   */
  async findRecording(id: string, officeId: string) {
    const recording = await this.prisma.callRecording.findFirst({
      where: { id, officeId },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, name: true } },
        messages: { orderBy: { seq: 'asc' } },
        consultations: {
          select: { id: true, content: true, type: true, createdAt: true },
        },
      },
    });
    if (!recording) throw new NotFoundException('Recording not found');
    return recording;
  }

  /**
   * 녹음 없이 통화 기록만 생성 (통화 종료 시 앱에서 자동 전송)
   */
  async createRecordingLog(
    officeId: string,
    userId: string,
    dto: {
      direction: string;
      phoneNumber: string;
      durationSec?: number;
      contactId?: string;
      result?: string;
    },
  ) {
    // 전화번호로 연락처 자동 매칭
    let contactId = dto.contactId || null;
    if (!contactId && dto.phoneNumber) {
      const contact = await this.prisma.contact.findFirst({
        where: { officeId, phone: dto.phoneNumber },
        select: { id: true },
      });
      contactId = contact?.id || null;
    }

    const recording = await this.prisma.callRecording.create({
      data: {
        officeId,
        userId,
        contactId,
        direction: dto.direction || 'inbound',
        phoneNumber: dto.phoneNumber || '',
        durationSec: dto.durationSec || 0,
        sttStatus: 'none',
        calledAt: new Date(),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    });

    return recording;
  }

  // ================================================================
  // VITO STT 처리
  // ================================================================

  /**
   * VITO STT 비동기 처리
   * 1. VITO 인증 → 토큰 발급
   * 2. 녹음 파일 업로드 → transcribe ID 발급
   * 3. 폴링으로 결과 대기 → CallRecordingMessage 생성
   */
  private async processSTT(recordingId: string, officeId: string, file: Express.Multer.File) {
    const clientId = process.env.VITO_CLIENT_ID;
    const clientSecret = process.env.VITO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      this.logger.warn('VITO credentials not configured, using dummy STT');
      await this.fallbackDummySTT(recordingId, file);
      return;
    }

    try {
      // 1. VITO 인증
      const authRes = await fetch('https://openapi.vito.ai/v1/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
      });
      const authData = await authRes.json() as { access_token?: string };
      if (!authData.access_token) {
        throw new Error('VITO auth failed');
      }
      const token = authData.access_token;

      // 2. 파일 업로드 + STT 요청
      const form = new FormData();
      form.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype || 'audio/mpeg',
      });
      form.append('config', JSON.stringify({ use_diarization: true, spk_count: 2 }));

      const transcribeRes = await fetch('https://openapi.vito.ai/v1/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...form.getHeaders(),
        },
        body: form.getBuffer() as unknown as BodyInit,
      });
      const transcribeData = await transcribeRes.json() as { id?: string };
      if (!transcribeData.id) {
        throw new Error('VITO transcribe failed');
      }
      const transcribeId = transcribeData.id;
      this.logger.log(`VITO STT started: ${transcribeId} for recording ${recordingId}`);

      // 3. 폴링 (최대 5분, 3초 간격)
      const maxAttempts = 100;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 3000));

        const statusRes = await fetch(`https://openapi.vito.ai/v1/transcribe/${transcribeId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const statusData = await statusRes.json() as {
          status: string;
          results?: {
            utterances: Array<{
              spk: number;
              msg: string;
              start_at: number;
              duration: number;
            }>;
          };
        };

        if (statusData.status === 'completed') {
          const utterances = statusData.results?.utterances || [];

          // CallRecordingMessage로 각 발화 저장
          if (utterances.length > 0) {
            await this.prisma.callRecordingMessage.createMany({
              data: utterances.map((u, idx) => ({
                recordingId,
                speaker: u.spk,
                text: u.msg,
                startMs: Math.round(u.start_at),
                endMs: Math.round(u.start_at + u.duration),
                seq: idx,
              })),
            });
          }

          // CallRecording 상태 업데이트
          await this.prisma.callRecording.update({
            where: { id: recordingId },
            data: { sttStatus: 'completed' },
          });

          this.logger.log(`VITO STT completed: ${recordingId}, ${utterances.length} messages`);

          // STT 완료 → Gemini 분석 시작
          if (utterances.length > 0) {
            this.analyzeWithGemini(recordingId, officeId);
          }
          return;
        }

        if (statusData.status === 'failed') {
          throw new Error('VITO STT processing failed');
        }
      }

      throw new Error('VITO STT timeout');
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.error(`STT failed for ${recordingId}: ${errMsg}`);
      await this.prisma.callRecording.update({
        where: { id: recordingId },
        data: { sttStatus: 'failed' },
      }).catch(() => {});
    }
  }

  private async fallbackDummySTT(recordingId: string, file: Express.Multer.File) {
    setTimeout(async () => {
      try {
        // 더미 메시지 생성
        await this.prisma.callRecordingMessage.createMany({
          data: [
            { recordingId, speaker: 0, text: '여보세요, 거기 부동산이죠?', startMs: 0, endMs: 3000, seq: 0 },
            { recordingId, speaker: 1, text: '네 안녕하세요, 김영공인중개사입니다.', startMs: 3000, endMs: 6500, seq: 1 },
            { recordingId, speaker: 0, text: `[더미 STT] 파일: ${file.originalname} (${Math.round(file.size / 1024)}KB)`, startMs: 6500, endMs: 10000, seq: 2 },
          ],
        });
        await this.prisma.callRecording.update({
          where: { id: recordingId },
          data: { sttStatus: 'completed' },
        });
        // 더미에서도 분석 시도
        this.analyzeWithGemini(recordingId, '');
      } catch (_) {}
    }, 3000);
  }

  // ================================================================
  // Gemini 통화 분석
  // ================================================================

  /**
   * STT 메시지를 Gemini API로 분석하여 상담 요약/고객 요구사항/다음 액션 추출
   */
  private async analyzeWithGemini(recordingId: string, officeId: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured, skipping analysis');
      return;
    }

    try {
      // 분석 상태 업데이트
      await this.prisma.callRecording.update({
        where: { id: recordingId },
        data: { analysisStatus: 'processing' },
      });

      // 메시지 조회
      const messages = await this.prisma.callRecordingMessage.findMany({
        where: { recordingId },
        orderBy: { seq: 'asc' },
      });

      if (messages.length === 0) {
        await this.prisma.callRecording.update({
          where: { id: recordingId },
          data: { analysisStatus: 'none' },
        });
        return;
      }

      // 대화 텍스트 구성
      const transcript = messages
        .map(m => `화자${m.speaker + 1}: ${m.text}`)
        .join('\n');

      // Gemini API 호출
      const prompt = `당신은 부동산 중개사무소의 전화 통화 내용을 분석하는 전문가입니다.
통화는 매물 문의, 소유주 연락, 세입자 문의, 가격 협상, 일정 조율, 업체 통화, 공동 중개, 기타 등 다양한 유형이 있습니다.

아래 통화 내용을 분석하여 JSON 형식으로 응답하세요. 반드시 아래 JSON 형식만 출력하고 다른 텍스트는 포함하지 마세요.

통화 내용:
${transcript}

응답 형식:
{
  "summary": "통화 상황을 2~3문장으로 요약. 누가 누구에게 왜 전화했고, 어떤 결론이 났는지.",
  "keyPoints": ["통화에서 나온 핵심 정보를 항목별로 정리 (지역, 매물, 가격, 조건, 일정 등 언급된 것만)"],
  "nextActions": ["통화 결과 중개사가 해야 할 다음 행동 (없으면 빈 배열)"],
  "callType": "매물문의 | 소유주연락 | 세입자문의 | 가격협상 | 일정조율 | 계약관련 | 하자수리 | 업체통화 | 공동중개 | 기타",
  "sentiment": "positive | neutral | negative"
}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      const geminiData = await geminiRes.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
        error?: { message?: string };
      };

      if (geminiData.error) {
        throw new Error(`Gemini API error: ${geminiData.error.message}`);
      }

      const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Gemini returned empty response');
      }

      // JSON 파싱
      let analysis: Record<string, unknown>;
      try {
        analysis = JSON.parse(responseText);
      } catch {
        // JSON이 아닌 경우 텍스트에서 JSON 추출 시도
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse Gemini response as JSON');
        }
      }

      // DB 업데이트
      await this.prisma.callRecording.update({
        where: { id: recordingId },
        data: {
          analysis: analysis as any,
          analysisStatus: 'completed',
        },
      });

      this.logger.log(`Gemini analysis completed: ${recordingId}`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Gemini analysis failed for ${recordingId}: ${errMsg}`);
      await this.prisma.callRecording.update({
        where: { id: recordingId },
        data: {
          analysisStatus: 'failed',
          analysis: { error: errMsg } as any,
        },
      }).catch(() => {});
    }
  }
}
