import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  function createService() {
    const server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    const service = new RealtimeService();
    service.bindServer(server as never);
    return { server, service };
  }

  it('emits listing updates to office and entity rooms', () => {
    const { server, service } = createService();

    service.emitListingUpdated({
      officeId: 'office-1',
      listingId: 'listing-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
      actorUserId: 'user-1',
    });

    expect(server.to).toHaveBeenCalledWith('office:office-1');
    expect(server.to).toHaveBeenCalledWith('listing:office-1:listing-1');
    expect(server.to).toHaveBeenCalledWith('property:office-1:property-1');
    expect(server.to).toHaveBeenCalledWith('listing-intake:office-1:intake-1');
    expect(server.emit).toHaveBeenCalledWith('listing.updated', {
      officeId: 'office-1',
      listingId: 'listing-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
      actorUserId: 'user-1',
    });
  });

  it('does nothing before a socket server is bound', () => {
    const service = new RealtimeService();

    expect(() =>
      service.emitListingUpdated({
        officeId: 'office-1',
        listingId: 'listing-1',
        propertyId: 'property-1',
      }),
    ).not.toThrow();
  });
});
