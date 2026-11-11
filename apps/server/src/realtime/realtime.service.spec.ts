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


  describe('disconnectUser', () => {
    it('disconnects every connection of that user through the per-user room', async () => {
      const disconnectSockets = jest.fn();
      const fetchSockets = jest.fn();
      const server = {
        in: jest.fn().mockReturnValue({ disconnectSockets, fetchSockets }),
      };
      const service = new RealtimeService();
      service.bindServer(server as never);

      await service.disconnectUser('user-1');

      expect(server.in).toHaveBeenCalledWith('user:user-1');
      // 연결을 닫기까지 한다(네임스페이스에서만 빼는 것이 아니다).
      expect(disconnectSockets).toHaveBeenCalledWith(true);
      // 다른 서버에 물어 목록을 받아 오는 왕복이 없다.
      expect(fetchSockets).not.toHaveBeenCalled();
    });

    it('does nothing before a socket server is bound', async () => {
      await expect(
        new RealtimeService().disconnectUser('user-1'),
      ).resolves.toBeUndefined();
    });
  });
});
