import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  listingIntakeRoom,
  listingRoom,
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

/** 착신 이벤트 — 사무소 전 직원 앱에 브로드캐스트 (레거시 MC TaskCd 릴레이 대체) */
interface CallIncomingEvent {
  officeId: string;
  callEventId: string;
  phoneNumber: string;
  isPrivate: boolean;
  providerCode: string;
  receivedNo?: string | null;
  occurredAt: string;
  /** GET /cti/lookup 결과 요약 (팝업 즉시 표시용) */
  lookup?: unknown;
}

interface CallUpdatedEvent {
  officeId: string;
  callEventId: string;
  status: string;
  endedAt?: string | null;
}

interface CallDialResultEvent {
  officeId: string;
  callEventId: string;
  success: boolean;
  message?: string | null;
}

interface CallLineStatusEvent {
  officeId: string;
  providerCode: string;
  connected: boolean;
  message?: string | null;
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

  // ================================================================
  // CTI — 브리지가 감지한 통화 이벤트를 사무소 전체에 브로드캐스트
  // ================================================================

  emitCallIncoming(event: CallIncomingEvent) {
    this.server?.to(officeRoom(event.officeId)).emit('call.incoming', event);
  }

  emitCallUpdated(event: CallUpdatedEvent) {
    this.server?.to(officeRoom(event.officeId)).emit('call.updated', event);
  }

  emitCallDialResult(event: CallDialResultEvent) {
    this.server?.to(officeRoom(event.officeId)).emit('call.dial.result', event);
  }

  emitCallLineStatus(event: CallLineStatusEvent) {
    this.server?.to(officeRoom(event.officeId)).emit('call.line.status', event);
  }
}
