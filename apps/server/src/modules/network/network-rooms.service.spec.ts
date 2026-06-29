import { NetworkRoomsService } from './network-rooms.service';

function createService() {
  const prisma = {
    networkRoom: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    networkRoomMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    office: {
      findFirst: jest.fn(),
    },
  };
  const notifications = {
    notify: jest.fn().mockResolvedValue([]),
  };

  return {
    prisma,
    notifications,
    service: new NetworkRoomsService(prisma as never, notifications as never),
  };
}

describe('NetworkRoomsService (멤버십 접근 제어)', () => {
  describe('assertApprovedMember', () => {
    it('approved 멤버가 아니면 Forbidden', async () => {
      const { prisma, service } = createService();
      prisma.networkRoomMember.findFirst.mockResolvedValue(null);

      await expect(
        service.assertApprovedMember('room-1', 'office-1'),
      ).rejects.toThrow('중개방 멤버만 접근할 수 있습니다');
      expect(prisma.networkRoomMember.findFirst).toHaveBeenCalledWith({
        where: { roomId: 'room-1', officeId: 'office-1', status: 'approved' },
      });
    });

    it('approved 멤버면 멤버십을 반환', async () => {
      const { prisma, service } = createService();
      const member = { id: 'member-1', status: 'approved' };
      prisma.networkRoomMember.findFirst.mockResolvedValue(member);

      await expect(
        service.assertApprovedMember('room-1', 'office-1'),
      ).resolves.toBe(member);
    });
  });

  describe('createRoom', () => {
    it('생성자 사무소를 admin + approved 멤버로 자동 등록한다', async () => {
      const { prisma, service } = createService();
      prisma.networkRoom.create.mockResolvedValue({
        id: 'room-1',
        name: '강동구 공동중개',
        type: 'public',
        _count: { members: 1 },
        createdByOffice: { id: 'office-1', name: '강동중개' },
        members: [{ id: 'member-1', officeId: 'office-1', role: 'admin' }],
      });

      const result = await service.createRoom('office-1', {
        name: '강동구 공동중개',
      });

      const createArgs = prisma.networkRoom.create.mock.calls[0][0];
      expect(createArgs.data.createdBy).toBe('office-1');
      expect(createArgs.data.members.create).toMatchObject({
        officeId: 'office-1',
        role: 'admin',
        status: 'approved',
        joinedAt: expect.any(Date),
      });
      expect(result.myMembership).toMatchObject({ role: 'admin' });
      expect(result.memberCount).toBe(1);
    });

    it('이름 없는 방 생성은 거부한다', async () => {
      const { service } = createService();
      await expect(
        service.createRoom('office-1', { name: '  ' }),
      ).rejects.toThrow('방 이름은 필수입니다');
    });
  });

  describe('getRoom', () => {
    it('private 방은 멤버십이 없으면 NotFound (존재 자체 숨김)', async () => {
      const { prisma, service } = createService();
      prisma.networkRoom.findFirst.mockResolvedValue({
        id: 'room-1',
        type: 'private',
        _count: { members: 2 },
        createdByOffice: { id: 'office-x', name: 'X' },
        members: [{ id: 'm-1', officeId: 'office-other', status: 'approved' }],
      });

      await expect(service.getRoom('room-1', 'office-1')).rejects.toThrow(
        '중개방을 찾을 수 없습니다',
      );
    });

    it('approved가 아닌 멤버는 멤버 목록을 받지 못한다', async () => {
      const { prisma, service } = createService();
      prisma.networkRoom.findFirst.mockResolvedValue({
        id: 'room-1',
        type: 'public',
        _count: { members: 2 },
        createdByOffice: { id: 'office-x', name: 'X' },
        members: [
          { id: 'm-1', officeId: 'office-other', status: 'approved' },
          { id: 'm-2', officeId: 'office-1', status: 'pending' },
        ],
      });

      const result = await service.getRoom('room-1', 'office-1');

      expect(result.members).toEqual([]);
      expect(result.myMembership).toMatchObject({ status: 'pending' });
      expect(result.memberCount).toBe(2);
    });

    it('approved 멤버는 전체 멤버 목록을 받는다', async () => {
      const { prisma, service } = createService();
      const members = [
        { id: 'm-1', officeId: 'office-1', status: 'approved' },
        { id: 'm-2', officeId: 'office-2', status: 'pending' },
      ];
      prisma.networkRoom.findFirst.mockResolvedValue({
        id: 'room-1',
        type: 'public',
        _count: { members: 1 },
        createdByOffice: { id: 'office-1', name: 'X' },
        members,
      });

      const result = await service.getRoom('room-1', 'office-1');

      expect(result.members).toEqual(members);
    });
  });

  describe('requestJoin', () => {
    it('pending 신청을 만들고 admin 사무소 owner/manager에게 알림을 보낸다', async () => {
      const { prisma, notifications, service } = createService();
      prisma.networkRoom.findFirst.mockResolvedValue({
        id: 'room-1',
        name: '강동구 공동중개',
        maxMembers: null,
        _count: { members: 2 },
      });
      prisma.networkRoomMember.findFirst.mockResolvedValue(null);
      prisma.networkRoomMember.create.mockResolvedValue({
        id: 'member-new',
        status: 'pending',
      });
      prisma.networkRoomMember.findMany.mockResolvedValue([
        { officeId: 'office-admin' },
      ]);
      prisma.office.findFirst.mockResolvedValue({ name: '신청사무소' });

      const result = await service.requestJoin('room-1', 'office-applicant');

      expect(result).toMatchObject({ status: 'pending' });
      expect(prisma.networkRoomMember.create).toHaveBeenCalledWith({
        data: {
          roomId: 'room-1',
          officeId: 'office-applicant',
          role: 'member',
          status: 'pending',
        },
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          officeId: 'office-admin',
          roles: ['owner', 'manager'],
          type: 'network_join_request',
          linkType: 'networkRoom',
          linkId: 'room-1',
        }),
      );
    });

    it('이미 approved면 거부한다', async () => {
      const { prisma, service } = createService();
      prisma.networkRoom.findFirst.mockResolvedValue({
        id: 'room-1',
        maxMembers: null,
        _count: { members: 2 },
      });
      prisma.networkRoomMember.findFirst.mockResolvedValue({
        id: 'm-1',
        status: 'approved',
      });

      await expect(
        service.requestJoin('room-1', 'office-1'),
      ).rejects.toThrow('이미 참여 중인 중개방입니다');
    });

    it('정원이 가득 차면 거부한다', async () => {
      const { prisma, service } = createService();
      prisma.networkRoom.findFirst.mockResolvedValue({
        id: 'room-1',
        maxMembers: 2,
        _count: { members: 2 },
      });
      prisma.networkRoomMember.findFirst.mockResolvedValue(null);

      await expect(
        service.requestJoin('room-1', 'office-1'),
      ).rejects.toThrow('중개방 정원이 가득 찼습니다');
    });

    it('left/rejected 멤버는 pending으로 재신청 처리한다', async () => {
      const { prisma, service } = createService();
      prisma.networkRoom.findFirst.mockResolvedValue({
        id: 'room-1',
        name: '방',
        maxMembers: null,
        _count: { members: 1 },
      });
      prisma.networkRoomMember.findFirst.mockResolvedValue({
        id: 'm-1',
        status: 'left',
      });
      prisma.networkRoomMember.update.mockResolvedValue({
        id: 'm-1',
        status: 'pending',
      });
      prisma.networkRoomMember.findMany.mockResolvedValue([]);
      prisma.office.findFirst.mockResolvedValue({ name: '사무소' });

      await service.requestJoin('room-1', 'office-1');

      expect(prisma.networkRoomMember.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { status: 'pending', role: 'member', joinedAt: null },
      });
      expect(prisma.networkRoomMember.create).not.toHaveBeenCalled();
    });
  });

  describe('updateMember (승인/거절)', () => {
    function mockAdmin(
      prisma: ReturnType<typeof createService>['prisma'],
      isAdmin: boolean,
    ) {
      // 첫 호출: assertAdmin, 두 번째 호출: 대상 멤버 조회
      prisma.networkRoomMember.findFirst
        .mockResolvedValueOnce(isAdmin ? { id: 'admin-m', role: 'admin' } : null)
        .mockResolvedValueOnce({
          id: 'member-2',
          roomId: 'room-1',
          status: 'pending',
          room: { maxMembers: null, _count: { members: 3 } },
        });
    }

    it('admin이 아니면 Forbidden', async () => {
      const { prisma, service } = createService();
      mockAdmin(prisma, false);

      await expect(
        service.updateMember('room-1', 'member-2', 'office-1', {
          status: 'approved',
        }),
      ).rejects.toThrow('중개방 관리자만 수행할 수 있습니다');
    });

    it('승인 시 joinedAt이 설정된다', async () => {
      const { prisma, service } = createService();
      mockAdmin(prisma, true);
      prisma.networkRoomMember.update.mockResolvedValue({
        id: 'member-2',
        status: 'approved',
      });

      await service.updateMember('room-1', 'member-2', 'office-1', {
        status: 'approved',
      });

      expect(prisma.networkRoomMember.update).toHaveBeenCalledWith({
        where: { id: 'member-2' },
        data: { status: 'approved', joinedAt: expect.any(Date) },
      });
    });

    it('거절 시 joinedAt은 null', async () => {
      const { prisma, service } = createService();
      mockAdmin(prisma, true);
      prisma.networkRoomMember.update.mockResolvedValue({
        id: 'member-2',
        status: 'rejected',
      });

      await service.updateMember('room-1', 'member-2', 'office-1', {
        status: 'rejected',
      });

      expect(prisma.networkRoomMember.update).toHaveBeenCalledWith({
        where: { id: 'member-2' },
        data: { status: 'rejected', joinedAt: null },
      });
    });

    it('approved/rejected 외 status는 거부한다', async () => {
      const { service } = createService();

      await expect(
        service.updateMember('room-1', 'member-2', 'office-1', {
          status: 'left',
        }),
      ).rejects.toThrow('status는 approved 또는 rejected여야 합니다');
    });

    it('pending이 아닌 신청은 처리하지 않는다', async () => {
      const { prisma, service } = createService();
      prisma.networkRoomMember.findFirst
        .mockResolvedValueOnce({ id: 'admin-m', role: 'admin' })
        .mockResolvedValueOnce({
          id: 'member-2',
          roomId: 'room-1',
          status: 'approved',
          room: { maxMembers: null, _count: { members: 3 } },
        });

      await expect(
        service.updateMember('room-1', 'member-2', 'office-1', {
          status: 'rejected',
        }),
      ).rejects.toThrow('승인 대기 상태의 신청만 처리할 수 있습니다');
    });
  });

  describe('leaveRoom', () => {
    it('참여 중이면 status를 left로 바꾼다', async () => {
      const { prisma, service } = createService();
      prisma.networkRoomMember.findFirst.mockResolvedValue({
        id: 'm-1',
        status: 'approved',
      });
      prisma.networkRoomMember.update.mockResolvedValue({
        id: 'm-1',
        status: 'left',
      });

      await service.leaveRoom('room-1', 'office-1');

      expect(prisma.networkRoomMember.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { status: 'left' },
      });
    });

    it('참여 중이 아니면 NotFound', async () => {
      const { prisma, service } = createService();
      prisma.networkRoomMember.findFirst.mockResolvedValue(null);

      await expect(service.leaveRoom('room-1', 'office-1')).rejects.toThrow(
        '참여 중인 중개방이 아닙니다',
      );
    });
  });
});
