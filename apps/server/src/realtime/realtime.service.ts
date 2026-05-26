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
}
