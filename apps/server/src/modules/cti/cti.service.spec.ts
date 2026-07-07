import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CtiService } from './cti.service';
import { CallEventDto } from './dto/cti.dto';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('CtiService', () => {
  function createService() {
    const prisma = {
      contactPhone: { findFirst: jest.fn() },
      callLog: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      vendorContact: { findMany: jest.fn() },
      consultation: { findMany: jest.fn(), findFirst: jest.fn() },
      propertyContact: { findMany: jest.fn() },
      buyerRequirement: { findFirst: jest.fn() },
      task: { findMany: jest.fn() },
      contact: { findFirst: jest.fn() },
      callRecording: { findFirst: jest.fn() },
    };
    const realtime = {
      emitCtiIncoming: jest.fn(),
      emitCtiCallUpdated: jest.fn(),
    };
    return {
      prisma,
      realtime,
      service: new CtiService(prisma as never, realtime as never),
    };
  }

  const ringEvent: CallEventDto = {
    type: 'ring',
    vendor: 'mock',
    caller: '010-1234-5678',
    callee: '0701234567',
    seqno: 'seq-1',
    occurredAt: '2026-07-06T09:00:00.000Z',
  };

  describe('ring', () => {
    it('발신번호를 정규화해 연락처를 매칭하고, 날짜 버킷 dedupe 키로 생성 후 cti.incoming을 emit한다', async () => {
      const { prisma, realtime, service } = createService();
      prisma.contactPhone.findFirst.mockResolvedValue({
        contactId: 'contact-1',
        contact: { id: 'contact-1', name: '김소유' },
      });
      prisma.callLog.create.mockResolvedValue({
        id: 'log-1',
        phoneNumber: '01012345678',
        lineNumber: '0701234567',
        status: 'ringing',
        startedAt: new Date('2026-07-06T09:00:00.000Z'),
        contact: { id: 'contact-1', name: '김소유' },
      });

      const result = await service.ingestCallEvent('office-1', 'user-1', ringEvent);

      expect(prisma.contactPhone.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { officeId: 'office-1', normalizedPhone: '01012345678', isActive: true },
        }),
      );
      expect(prisma.callLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contactId: 'contact-1',
            direction: 'inbound',
            phoneNumber: '01012345678',
            status: 'ringing',
            vendorSeqno: 'seq-1#20260706', // seqno + UTC 날짜 버킷
          }),
        }),
      );
      expect(realtime.emitCtiIncoming).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({ handled: true, deduped: false }));
    });

    it('멀티 PC 중복 보고(P2002): 같은 번호의 기존 로그를 반환하고 emit하지 않는다', async () => {
      const { prisma, realtime, service } = createService();
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.callLog.create.mockRejectedValue(p2002());
      prisma.callLog.findUnique.mockResolvedValue({
        id: 'log-1',
        phoneNumber: '01012345678',
        status: 'ringing',
        startedAt: new Date(),
        contact: null,
      });

      const result = await service.ingestCallEvent('office-1', 'user-2', ringEvent);

      expect(result).toEqual(expect.objectContaining({ handled: true, deduped: true }));
      expect(realtime.emitCtiIncoming).not.toHaveBeenCalled();
    });

    it('seqno 재사용(같은 키, 다른 번호): 접미사 붙인 새 로그를 만들어 과거 로그 오염을 막는다', async () => {
      const { prisma, realtime, service } = createService();
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.callLog.create
        .mockRejectedValueOnce(p2002())
        .mockResolvedValueOnce({
          id: 'log-2',
          phoneNumber: '01012345678',
          lineNumber: null,
          status: 'ringing',
          startedAt: new Date(),
          contact: null,
        });
      prisma.callLog.findUnique.mockResolvedValue({
        id: 'log-old',
        phoneNumber: '01099998888', // 다른 번호 — 재사용된 seqno
      });

      const result = await service.ingestCallEvent('office-1', 'user-1', ringEvent);

      expect(prisma.callLog.create).toHaveBeenCalledTimes(2);
      const secondCall = prisma.callLog.create.mock.calls[1][0];
      expect(secondCall.data.vendorSeqno).toMatch(/^seq-1#20260706~[0-9a-f]{8}$/);
      expect(realtime.emitCtiIncoming).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({ deduped: false }));
    });

    it('seqno가 없으면 dedupe 없이 생성한다', async () => {
      const { prisma, service } = createService();
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.callLog.create.mockResolvedValue({
        id: 'log-3',
        phoneNumber: '01012345678',
        lineNumber: null,
        status: 'ringing',
        startedAt: new Date(),
        contact: null,
      });

      await service.ingestCallEvent('office-1', 'user-1', {
        ...ringEvent,
        seqno: undefined,
      });

      expect(prisma.callLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ vendorSeqno: null }),
        }),
      );
    });
  });

  describe('terminate', () => {
    it('durationSec > 0 이면 ended, 0이면 missed로 갱신하고 cti.call.updated를 emit한다', async () => {
      const { prisma, realtime, service } = createService();
      prisma.callLog.findUnique.mockResolvedValue({
        id: 'log-1',
        phoneNumber: '01012345678',
        status: 'ringing',
        endedAt: null,
      });
      prisma.callLog.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'log-1',
            status: data.status,
            durationSec: data.durationSec,
            contact: null,
          }),
      );

      await service.ingestCallEvent('office-1', 'user-1', {
        ...ringEvent,
        type: 'terminate',
        durationSec: 42,
      });
      expect(prisma.callLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ended', durationSec: 42 }),
        }),
      );

      await service.ingestCallEvent('office-1', 'user-1', {
        ...ringEvent,
        type: 'terminate',
        durationSec: 0,
      });
      expect(prisma.callLog.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'missed', durationSec: 0 }),
        }),
      );
      expect(realtime.emitCtiCallUpdated).toHaveBeenCalledTimes(2);
    });

    it('seqno 키의 로그가 다른 번호이면(재사용) 무시하고 번호+시간창으로 찾는다', async () => {
      const { prisma, service } = createService();
      prisma.callLog.findUnique.mockResolvedValue({
        id: 'log-other',
        phoneNumber: '01099998888',
        status: 'ringing',
      });
      prisma.callLog.findFirst.mockResolvedValue({
        id: 'log-mine',
        phoneNumber: '01012345678',
        status: 'ringing',
        endedAt: null,
      });
      prisma.callLog.update.mockResolvedValue({
        id: 'log-mine',
        status: 'ended',
        durationSec: 10,
        contact: null,
      });

      await service.ingestCallEvent('office-1', 'user-1', {
        ...ringEvent,
        type: 'terminate',
        durationSec: 10,
      });

      expect(prisma.callLog.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'log-mine' } }),
      );
    });

    it('이미 종료된 로그(endedAt 근접)면 중복 보고로 간주해 갱신/emit하지 않는다', async () => {
      const { prisma, realtime, service } = createService();
      prisma.callLog.findUnique.mockResolvedValue({
        id: 'log-1',
        phoneNumber: '01012345678',
        status: 'ended',
        endedAt: new Date('2026-07-06T09:00:30.000Z'), // 30초 차이
      });

      const result = await service.ingestCallEvent('office-1', 'user-2', {
        ...ringEvent,
        type: 'terminate',
        durationSec: 42,
        occurredAt: '2026-07-06T09:01:00.000Z',
      });

      expect(result).toEqual(expect.objectContaining({ deduped: true }));
      expect(prisma.callLog.update).not.toHaveBeenCalled();
      expect(realtime.emitCtiCallUpdated).not.toHaveBeenCalled();
    });

    it('terminate-only 동시 보고(P2002): 먼저 생성된 행을 채택하고 중복 생성하지 않는다', async () => {
      const { prisma, realtime, service } = createService();
      prisma.callLog.findUnique
        .mockResolvedValueOnce(null) // 당일 키 조회
        .mockResolvedValueOnce(null) // 전날 키 조회
        .mockResolvedValueOnce({
          // P2002 후 승자 재조회
          id: 'log-winner',
          phoneNumber: '01012345678',
          status: 'ended',
          durationSec: 10,
          contact: null,
        });
      prisma.callLog.findFirst.mockResolvedValue(null);
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.callLog.create.mockRejectedValue(p2002());

      const result = await service.ingestCallEvent('office-1', 'user-1', {
        ...ringEvent,
        type: 'terminate',
        durationSec: 10,
      });

      expect(result).toEqual(
        expect.objectContaining({ deduped: true, callLog: expect.objectContaining({ id: 'log-winner' }) }),
      );
      expect(realtime.emitCtiCallUpdated).not.toHaveBeenCalled();
    });

    it('대응하는 ring이 없으면(유실) 연락처 매칭까지 해서 새로 남긴다', async () => {
      const { prisma, service } = createService();
      prisma.callLog.findUnique.mockResolvedValue(null);
      prisma.callLog.findFirst.mockResolvedValue(null);
      prisma.contactPhone.findFirst.mockResolvedValue({
        contactId: 'contact-1',
        contact: { id: 'contact-1', name: '김소유' },
      });
      prisma.callLog.create.mockResolvedValue({
        id: 'log-3',
        status: 'ended',
        durationSec: 10,
        contact: { id: 'contact-1', name: '김소유' },
      });

      await service.ingestCallEvent('office-1', 'user-1', {
        ...ringEvent,
        type: 'terminate',
        durationSec: 10,
      });

      expect(prisma.callLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ended',
            durationSec: 10,
            contactId: 'contact-1',
            userId: 'user-1',
          }),
        }),
      );
    });
  });

  describe('모바일(vendor=mobile) 이벤트', () => {
    it('같은 번호 5분 내 재통화도 이전 통화에 dedupe되지 않고 새 행으로 기록된다', async () => {
      const { prisma, service } = createService();
      // seqno(클라이언트 UUID) 키 조회는 미스 — ring이 없으므로
      prisma.callLog.findUnique.mockResolvedValue(null);
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.callLog.create.mockResolvedValue({
        id: 'log-m2',
        status: 'ended',
        durationSec: 30,
        contact: null,
      });

      await service.ingestCallEvent('office-1', 'user-1', {
        type: 'terminate',
        vendor: 'mobile',
        caller: '01012345678',
        callee: '',
        seqno: 'uuid-call-b',
        direction: 'inbound',
        durationSec: 30,
        occurredAt: '2026-07-07T09:03:00.000Z',
      });

      // 모바일은 번호+시간창 fallback을 타지 않는다 (이전 통화 오매칭 방지)
      expect(prisma.callLog.findFirst).not.toHaveBeenCalled();
      expect(prisma.callLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendorSeqno: 'uuid-call-b#20260707',
            status: 'ended',
          }),
        }),
      );
    });

    it('발신 terminate: direction=outbound로 기록하고 0초여도 missed가 아니라 ended', async () => {
      const { prisma, service } = createService();
      prisma.callLog.findFirst.mockResolvedValue(null);
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.callLog.create.mockResolvedValue({
        id: 'log-m1',
        status: 'ended',
        durationSec: 0,
        contact: null,
      });

      await service.ingestCallEvent('office-1', 'user-1', {
        type: 'terminate',
        vendor: 'mobile',
        caller: '010-1234-5678',
        callee: '01099998888',
        direction: 'outbound',
        durationSec: 0,
        occurredAt: '2026-07-07T09:00:00.000Z',
      });

      // 모바일은 번호+시간창 fallback을 타지 않는다
      expect(prisma.callLog.findFirst).not.toHaveBeenCalled();
      expect(prisma.callLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: 'outbound',
            status: 'ended',
            vendor: 'mobile',
          }),
        }),
      );
    });
  });

  describe('updateCallLog', () => {
    it('recordingId 연결 시 사무소 소유 녹음인지 검증한다', async () => {
      const { prisma, service } = createService();
      prisma.callLog.findFirst.mockResolvedValue({ id: 'log-1' });
      prisma.callRecording.findFirst.mockResolvedValue({ id: 'rec-1' });
      prisma.callLog.update.mockResolvedValue({ id: 'log-1', contact: null });

      await service.updateCallLog('office-1', 'log-1', { recordingId: 'rec-1' });

      expect(prisma.callRecording.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rec-1', officeId: 'office-1' } }),
      );
      expect(prisma.callLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordingId: 'rec-1' }),
        }),
      );
    });
  });

  describe('occurredAt 검증', () => {
    it('Date가 해석 못 하는 ISO8601 변형(주차 날짜)은 BadRequest', async () => {
      const { service } = createService();
      await expect(
        service.ingestCallEvent('office-1', 'user-1', {
          ...ringEvent,
          occurredAt: '2026-W27-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('lookup', () => {
    it('연락처도 업체도 없으면 isNew=true, 최근 통화 이력만 반환한다', async () => {
      const { prisma, service } = createService();
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.vendorContact.findMany.mockResolvedValue([]);
      prisma.callLog.findMany.mockResolvedValue([{ id: 'log-1' }]);

      const result = await service.lookup('office-1', '010-9999-8888');

      expect(result.isNew).toBe(true);
      expect(result.contact).toBeNull();
      expect(result.recentCalls).toHaveLength(1);
      expect(prisma.consultation.findMany).not.toHaveBeenCalled();
    });

    it('업체 담당자는 normalizedPhone으로 매칭한다 (하이픈 저장 대응)', async () => {
      const { prisma, service } = createService();
      prisma.contactPhone.findFirst.mockResolvedValue(null);
      prisma.vendorContact.findMany.mockResolvedValue([
        { id: 'vc-1', name: '김기사', vendor: { id: 'v-1', name: '한솔설비' } },
      ]);
      prisma.callLog.findMany.mockResolvedValue([]);

      const result = await service.lookup('office-1', '010-5555-6666');

      expect(prisma.vendorContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ normalizedPhone: '01055556666' }),
        }),
      );
      expect(result.isNew).toBe(false);
      expect(result.vendorContacts).toHaveLength(1);
    });

    it('연락처 매칭 시 상담/매물/구매조건/업무를 함께 반환한다', async () => {
      const { prisma, service } = createService();
      prisma.contactPhone.findFirst.mockResolvedValue({
        contact: { id: 'contact-1', name: '김소유', tags: [], memo: null },
      });
      prisma.vendorContact.findMany.mockResolvedValue([]);
      prisma.callLog.findMany.mockResolvedValue([]);
      prisma.consultation.findMany.mockResolvedValue([{ id: 'consult-1' }]);
      prisma.propertyContact.findMany.mockResolvedValue([{ role: 'owner' }]);
      prisma.buyerRequirement.findFirst.mockResolvedValue(null);
      prisma.task.findMany.mockResolvedValue([]);

      const result = await service.lookup('office-1', '01012345678');

      expect(result.isNew).toBe(false);
      expect(result.contact).toEqual(
        expect.objectContaining({ id: 'contact-1', name: '김소유' }),
      );
      expect(result.recentConsultations).toHaveLength(1);
      expect(result.properties).toHaveLength(1);
    });
  });

  describe('listCallLogs', () => {
    it('비숫자 page/limit는 NaN으로 흐르지 않고 기본값으로 처리한다', async () => {
      const { prisma, service } = createService();
      prisma.callLog.findMany.mockResolvedValue([]);
      prisma.callLog.count.mockResolvedValue(0);

      const result = await service.listCallLogs('office-1', {
        page: Number('abc'),
        limit: Number('xyz'),
      });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(prisma.callLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });
});
