import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  listingIntakeRoom,
  listingRoom,
  networkRoom,
  officeRoom,
  propertyRoom,
} from './realtime.rooms';

interface ListingUpdatedEvent {
  officeId: string;
  listingId: string;
  propertyId: string;
  intakeId?: string | null;
  actorUserId?: string | null;
}

interface ListingIntakeUpdatedEvent {
  officeId: string;
  intakeId: string;
  propertyId: string;
  actorUserId?: string | null;
}

export interface NotificationCreatedEvent {
  officeId: string;
  /** 수신 대상 사용자 — 사용자별 room이 없으므로 클라이언트가 이 값으로 필터링한다. */
  userId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    content: string | null;
    linkType: string | null;
    linkId: string | null;
    isRead: boolean;
    createdAt: string;
  };
}

export interface NetworkMessageCreatedEvent {
  roomId: string;
  message: {
    id: string;
    roomId: string;
    officeId: string;
    userId: string;
    content: string;
    sharedPropertyId: string | null;
    createdAt: string;
    user: { id: string; name: string } | null;
    office: { id: string; name: string } | null;
    /** 마스킹 직렬화된 공유 매물 카드 (NetworkSharedPropertyView) — 수신자가 여러 사무소라 항상 최대 마스킹 */
    sharedProperty: unknown;
  };
}

export interface CtiIncomingCallEvent {
  officeId: string;
  callLogId: string;
  /** 정규화된 발신번호 (01012345678) */
  phoneNumber: string;
  /** 착신 회선 */
  lineNumber: string | null;
  /** 매칭된 연락처 (null = 미등록 번호) */
  contact: { id: string; name: string } | null;
  startedAt: string;
}

export interface CtiCallUpdatedEvent {
  officeId: string;
  callLogId: string;
  /** ringing / answered / missed / ended */
  status: string;
  durationSec: number;
}

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  bindServer(server: Server) {
    this.server = server;
  }

  emitListingUpdated(event: ListingUpdatedEvent) {
    if (!this.server) return;

    const emitter = this.server
      .to(officeRoom(event.officeId))
      .to(listingRoom(event.officeId, event.listingId))
      .to(propertyRoom(event.officeId, event.propertyId));

    if (event.intakeId) {
      emitter.to(listingIntakeRoom(event.officeId, event.intakeId));
    }

    emitter.emit('listing.updated', event);
  }

  emitListingIntakeUpdated(event: ListingIntakeUpdatedEvent) {
    if (!this.server) return;

    this.server
      .to(officeRoom(event.officeId))
      .to(listingIntakeRoom(event.officeId, event.intakeId))
      .to(propertyRoom(event.officeId, event.propertyId))
      .emit('listing-intake.updated', event);
  }

  /**
   * 네트워크 중개방 채팅 push. 'network.room.join'으로 채널에 들어온
   * 모든 사무소 소켓에 broadcast된다 (payload는 마스킹 직렬화 완료 상태).
   */
  emitNetworkMessageCreated(event: NetworkMessageCreatedEvent) {
    if (!this.server) return;

    this.server
      .to(networkRoom(event.roomId))
      .emit('network.message.created', event);
  }

  /**
   * 알림 생성 push. 사용자별 room이 없으므로 office room으로 emit하고,
   * 클라이언트가 payload.userId === 내 userId 인 이벤트만 처리한다.
   */
  emitNotificationCreated(event: NotificationCreatedEvent) {
    if (!this.server) return;

    this.server
      .to(officeRoom(event.officeId))
      .emit('notification.created', event);
  }

  /** 전화 수신(ring) push — 사무소 전 직원 화면에 수신 배너/팝업을 띄운다. */
  emitCtiIncoming(event: CtiIncomingCallEvent) {
    if (!this.server) return;

    this.server.to(officeRoom(event.officeId)).emit('cti.incoming', event);
  }

  /** 통화 상태 변화(종료/부재중) push — 열린 수신 팝업의 상태를 갱신한다. */
  emitCtiCallUpdated(event: CtiCallUpdatedEvent) {
    if (!this.server) return;

    this.server.to(officeRoom(event.officeId)).emit('cti.call.updated', event);
  }
}
