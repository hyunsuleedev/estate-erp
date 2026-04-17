import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import FormData = require('form-data');

export interface ConsultationSearchQuery {
  contactId?: string;
  propertyId?: string;
  listingId?: string;
  matchId?: string;
  buyerReqId?: string;
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
    property: { select: { id: true, memo: true, site: { select: { name: true } } } },
    listing: { select: { id: true, transactionType: true, price: true, checkStatus: true } },
    match: { select: { id: true, stage: true } },
    buyerRequirement: { select: { id: true, status: true, transactionType: true } },
    createdBy: { select: { id: true, name: true } },
  };

  async findAll(officeId: string, query: ConsultationSearchQuery = {}) {
    const where: Prisma.ConsultationWhereInput = { officeId };

    if (query.contactId) where.contactId = query.contactId;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.listingId) where.listingId = query.listingId;
    if (query.matchId) where.matchId = query.matchId;
    if (query.buyerReqId) where.buyerReqId = query.buyerReqId;
    if (query.type) where.type = query.type;
    if (query.createdById) where.createdById = query.createdById;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

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
      content: string;
      propertyId?: string;
      listingId?: string;
      matchId?: string;
      buyerReqId?: string;
    },
  ) {
    const { propertyId, listingId, matchId, buyerReqId, ...rest } = dto;
    return this.prisma.consultation.create({
      data: {
        officeId,
        createdById: userId,
        ...rest,
        propertyId: propertyId || undefined,
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

  async createWithRecording(
    officeId: string,
    userId: string,
    dto: { contactId: string; type: string },
    file: Express.Multer.File,
  ) {
    // 1. 상담 기록 생성 (내용은 STT 결과로 나중에 채워짐)
    const consultation = await this.prisma.consultation.create({
      data: {
        officeId,
        createdById: userId,
        contactId: dto.contactId,
        type: dto.type,
        content: '[녹음 분석 중...]',
      },
      include: this.defaultInclude,
    });

    // 2. 비동기 STT 처리 시작
    // TODO: VITO API 키 발급 후 실제 연동
    // 현재는 3초 후 더미 결과로 업데이트
    this.processSTT(consultation.id, file);

    return {
      consultation,
      sttStatus: 'processing',
      recordingFileName: file.originalname,
      recordingSize: file.size,
    };
  }

  async getSttStatus(id: string, officeId: string) {
    const consultation = await this.prisma.consultation.findFirst({
      where: { id, officeId },
      select: { id: true, content: true },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');

    return {
      id: consultation.id,
      sttStatus: consultation.content.startsWith('[녹음 분석 중')
        ? 'processing'
        : 'completed',
      content: consultation.content,
    };
  }

  /**
   * VITO STT 비동기 처리
   * 1. VITO 인증 → 토큰 발급
   * 2. 녹음 파일 업로드 → transcribe ID 발급
   * 3. 폴링으로 결과 대기 → consultation.content 업데이트
   */
  private async processSTT(consultationId: string, file: Express.Multer.File) {
    const clientId = process.env.VITO_CLIENT_ID;
    const clientSecret = process.env.VITO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      this.logger.warn('VITO credentials not configured, using dummy STT');
      await this.fallbackDummySTT(consultationId, file);
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
      form.append('config', JSON.stringify({ use_diarization: true }));

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
      this.logger.log(`VITO STT started: ${transcribeId}`);

      // 3. 폴링 (최대 5분, 3초 간격)
      const maxAttempts = 100;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 3000));

        const statusRes = await fetch(`https://openapi.vito.ai/v1/transcribe/${transcribeId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const statusData = await statusRes.json() as {
          status: string;
          results?: { utterances: Array<{ spk: number; msg: string }> };
        };

        if (statusData.status === 'completed') {
          const utterances = statusData.results?.utterances || [];
          const text = utterances.length > 0
            ? utterances.map(u => `화자${u.spk + 1}: ${u.msg}`).join('\n')
            : '[음성이 감지되지 않았습니다]';

          await this.prisma.consultation.update({
            where: { id: consultationId },
            data: { content: text },
          });
          this.logger.log(`VITO STT completed: ${consultationId}`);
          return;
        }

        if (statusData.status === 'failed') {
          throw new Error('VITO STT processing failed');
        }
      }

      throw new Error('VITO STT timeout');
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.error(`STT failed for ${consultationId}: ${errMsg}`);
      await this.prisma.consultation.update({
        where: { id: consultationId },
        data: { content: `[STT 분석 실패] ${errMsg}` },
      }).catch(() => {});
    }
  }

  private async fallbackDummySTT(consultationId: string, file: Express.Multer.File) {
    setTimeout(async () => {
      try {
        await this.prisma.consultation.update({
          where: { id: consultationId },
          data: {
            content: `[STT 스텁] 파일: ${file.originalname} (${Math.round(file.size / 1024)}KB)\n`
              + `VITO API 키가 설정되지 않아 더미 결과를 반환합니다.`,
          },
        });
      } catch (_) {}
    }, 3000);
  }
}
