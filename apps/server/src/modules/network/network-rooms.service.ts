import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export type RoomsScope = 'mine' | 'discover';

export interface ListRoomsOptions {
  scope?: RoomsScope;
  region?: string;
  /** 방 이름 검색 — private 방은 검색으로만 발견 가능 */
  search?: string;
}

export interface CreateRoomDto {
  name: string;
  description?: string;
  type?: string;
  region?: string;
  maxMembers?: number;
}

const ROOM_TYPES = new Set(['public', 'private']);
const MEMBER_DECISIONS = new Set(['approved', 'rejected']);

const roomMemberCountArgs = {
  _count: {
    select: { members: { where: { status: 'approved' } } },
  },
} satisfies Pick<Prisma.NetworkRoomInclude, '_count'>;

@Injectable()
export class NetworkRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── 접근 제어 헬퍼 ───────────────────────────────────────────

  /** 방의 approved 멤버십을 반환. 없으면 null. */
  async getApprovedMembership(roomId: string, officeId: string) {
    return this.prisma.networkRoomMember.findFirst({
      where: { roomId, officeId, status: 'approved' },
    });
  }

  /** 방 컨텐츠(공유매물/메시지)는 approved 멤버만 접근 가능. */
  async assertApprovedMember(roomId: string, officeId: string) {
    const member = await this.getApprovedMembership(roomId, officeId);
    if (!member) {
      throw new ForbiddenException('중개방 멤버만 접근할 수 있습니다');
    }
    return member;
  }

  async assertAdmin(roomId: string, officeId: string) {
    const member = await this.prisma.networkRoomMember.findFirst({
      where: { roomId, officeId, role: 'admin', status: 'approved' },
    });
    if (!member) {
      throw new ForbiddenException('중개방 관리자만 수행할 수 있습니다');
    }
    return member;
  }

  // ── 방 목록/생성/상세 ────────────────────────────────────────

  async listRooms(officeId: string, options: ListRoomsOptions = {}) {
    const scope: RoomsScope = options.scope === 'discover' ? 'discover' : 'mine';

    const where: Prisma.NetworkRoomWhereInput = { isActive: true };

    if (options.region) {
      where.region = options.region;
    }
    if (options.search) {
      where.name = { contains: options.search, mode: 'insensitive' };
    }

    if (scope === 'mine') {
      where.members = {
        some: { officeId, status: { in: ['pending', 'approved'] } },
      };
    } else if (!options.search) {
      // 공개방 디렉토리 — private 방은 이름 검색으로만 노출
      where.type = 'public';
    }

    const rooms = await this.prisma.networkRoom.findMany({
      where,
      include: {
        ...roomMemberCountArgs,
        createdByOffice: { select: { id: true, name: true } },
        members: { where: { officeId } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rooms
      .filter((room) => {
        if (scope === 'mine') return true;
        // discover + search 시 private 방은 멤버이거나 이름이 정확히 검색된 경우만
        return room.type === 'public' || !!options.search || room.members.length > 0;
      })
      .map((room) => this.toRoomSummary(room, officeId));
  }

  async createRoom(officeId: string, dto: CreateRoomDto) {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('방 이름은 필수입니다');
    }

    const type = dto.type ?? 'public';
    if (!ROOM_TYPES.has(type)) {
      throw new BadRequestException('type은 public 또는 private이어야 합니다');
    }

    if (dto.maxMembers !== undefined && dto.maxMembers !== null && dto.maxMembers < 1) {
      throw new BadRequestException('maxMembers는 1 이상이어야 합니다');
    }

    const room = await this.prisma.networkRoom.create({
      data: {
        name,
        description: dto.description ?? null,
        type,
        region: dto.region ?? null,
        maxMembers: dto.maxMembers ?? null,
        createdBy: officeId,
        members: {
          create: {
            officeId,
            role: 'admin',
            status: 'approved',
            joinedAt: new Date(),
          },
        },
      },
      include: {
        ...roomMemberCountArgs,
        createdByOffice: { select: { id: true, name: true } },
        members: { where: { officeId } },
      },
    });

    return this.toRoomSummary(room, officeId);
  }

  async getRoom(roomId: string, officeId: string) {
    const room = await this.prisma.networkRoom.findFirst({
      where: { id: roomId },
      include: {
        ...roomMemberCountArgs,
        createdByOffice: { select: { id: true, name: true } },
        members: {
          include: { office: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('중개방을 찾을 수 없습니다');
    }

    const myMembership =
      room.members.find((member) => member.officeId === officeId) ?? null;
    const isApproved = myMembership?.status === 'approved';

    // private 방은 멤버십이 전혀 없으면 존재 자체를 숨긴다
    if (room.type === 'private' && !myMembership) {
      throw new NotFoundException('중개방을 찾을 수 없습니다');
    }

    const { members, _count, ...rest } = room;

    return {
      ...rest,
      memberCount: _count.members,
      myMembership,
      // 멤버 목록은 approved 멤버에게만 — 그 외에는 빈 배열
      members: isApproved ? members : [],
    };
  }

  // ── 가입/승인/탈퇴 ──────────────────────────────────────────

  async requestJoin(roomId: string, officeId: string) {
    const room = await this.prisma.networkRoom.findFirst({
      where: { id: roomId, isActive: true },
      include: roomMemberCountArgs,
    });
    if (!room) {
      throw new NotFoundException('중개방을 찾을 수 없습니다');
    }

    const existing = await this.prisma.networkRoomMember.findFirst({
      where: { roomId, officeId },
    });

    if (existing?.status === 'approved') {
      throw new BadRequestException('이미 참여 중인 중개방입니다');
    }
    if (existing?.status === 'pending') {
      throw new BadRequestException('이미 가입 신청이 승인 대기 중입니다');
    }

    if (room.maxMembers !== null && room._count.members >= room.maxMembers) {
      throw new BadRequestException('중개방 정원이 가득 찼습니다');
    }

    const member = existing
      ? await this.prisma.networkRoomMember.update({
          where: { id: existing.id },
          data: { status: 'pending', role: 'member', joinedAt: null },
        })
      : await this.prisma.networkRoomMember.create({
          data: { roomId, officeId, role: 'member', status: 'pending' },
        });

    await this.notifyAdmins(roomId, room.name, officeId);

    return member;
  }

  private async notifyAdmins(
    roomId: string,
    roomName: string,
    applicantOfficeId: string,
  ) {
    const [admins, applicantOffice] = await Promise.all([
      this.prisma.networkRoomMember.findMany({
        where: { roomId, role: 'admin', status: 'approved' },
        select: { officeId: true },
      }),
      this.prisma.office.findFirst({
        where: { id: applicantOfficeId },
        select: { name: true },
      }),
    ]);

    await Promise.all(
      admins.map((admin) =>
        this.notifications.notify({
          officeId: admin.officeId,
          roles: ['owner', 'manager'],
          type: 'network_join_request',
          title: `중개방 가입 신청: ${roomName}`,
          content: `${applicantOffice?.name ?? '다른 사무소'}가 가입을 신청했습니다`,
          linkType: 'networkRoom',
          linkId: roomId,
        }),
      ),
    );
  }

  async updateMember(
    roomId: string,
    memberId: string,
    officeId: string,
    dto: { status: string },
  ) {
    if (!MEMBER_DECISIONS.has(dto.status)) {
      throw new BadRequestException('status는 approved 또는 rejected여야 합니다');
    }

    await this.assertAdmin(roomId, officeId);

    const member = await this.prisma.networkRoomMember.findFirst({
      where: { id: memberId, roomId },
      include: { room: { include: roomMemberCountArgs } },
    });
    if (!member) {
      throw new NotFoundException('가입 신청을 찾을 수 없습니다');
    }
    if (member.status !== 'pending') {
      throw new BadRequestException('승인 대기 상태의 신청만 처리할 수 있습니다');
    }

    if (
      dto.status === 'approved' &&
      member.room.maxMembers !== null &&
      member.room._count.members >= member.room.maxMembers
    ) {
      throw new BadRequestException('중개방 정원이 가득 찼습니다');
    }

    return this.prisma.networkRoomMember.update({
      where: { id: memberId },
      data: {
        status: dto.status,
        joinedAt: dto.status === 'approved' ? new Date() : null,
      },
    });
  }

  async leaveRoom(roomId: string, officeId: string) {
    const member = await this.prisma.networkRoomMember.findFirst({
      where: { roomId, officeId, status: { in: ['pending', 'approved'] } },
    });
    if (!member) {
      throw new NotFoundException('참여 중인 중개방이 아닙니다');
    }

    return this.prisma.networkRoomMember.update({
      where: { id: member.id },
      data: { status: 'left' },
    });
  }

  // ── 내부 직렬화 ─────────────────────────────────────────────

  private toRoomSummary(
    room: Prisma.NetworkRoomGetPayload<{
      include: {
        _count: { select: { members: true } };
        createdByOffice: { select: { id: true; name: true } };
        members: true;
      };
    }>,
    officeId: string,
  ) {
    const { members, _count, ...rest } = room;
    const myMembership =
      members.find((member) => member.officeId === officeId) ?? null;

    return {
      ...rest,
      memberCount: _count.members,
      myMembership,
    };
  }
}
