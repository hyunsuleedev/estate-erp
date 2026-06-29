import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService', () => {
  const ctx = { officeId: 'office-1', userId: 'user-1' };

  function createService() {
    const listings = {
      create: jest.fn().mockResolvedValue({ id: 'listing-1' }),
    };
    const listingAdvertisements = {
      findAll: jest.fn().mockResolvedValue({ items: [], pagination: { total: 0 } }),
      create: jest.fn().mockResolvedValue({ id: 'ad-1' }),
      update: jest.fn().mockResolvedValue({ id: 'ad-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'ad-1' }),
    };
    const listingIntakes = {
      findAll: jest.fn().mockResolvedValue({ items: [], pagination: { total: 0 } }),
      findOne: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      create: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      update: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'intake-1', status: 'cancelled' }),
    };
    const noop = {};

    const service = new (McpToolsService as any)(
      listings,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      listingAdvertisements,
      noop, // officeAdvertisements
      listingIntakes,
    ) as McpToolsService;

    return { service, listings, listingAdvertisements, listingIntakes };
  }

  it('registers listing intake table CRUD tools', () => {
    const { service } = createService();

    const toolNames = service.getToolDefinitions().map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'find_listing_intakes',
        'get_listing_intake',
        'create_listing_intake',
        'update_listing_intake',
        'delete_listing_intake',
      ]),
    );
  });

  it('requires intakeId when MCP creates a listing row', async () => {
    const { service, listings } = createService();

    const result = await service.executeTool(
      'create_listing',
      { propertyId: 'property-1', transactionType: 'sale' },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('intakeId');
    expect(listings.create).not.toHaveBeenCalled();
  });

  it('passes intakeId through when MCP creates a listing row', async () => {
    const { service, listings } = createService();

    await service.executeTool(
      'create_listing',
      {
        intakeId: 'intake-1',
        propertyId: 'property-1',
        transactionType: 'sale',
        price: 150000,
      },
      ctx,
    );

    expect(listings.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        intakeId: 'intake-1',
        propertyId: 'property-1',
        transactionType: 'sale',
        price: 150000,
      }),
    );
  });

  it('delegates create_listing_intake to the listing intake service', async () => {
    const { service, listingIntakes } = createService();

    await service.executeTool(
      'create_listing_intake',
      {
        propertyId: 'property-1',
        status: 'active',
        memo: '테스트 의뢰',
      },
      ctx,
    );

    expect(listingIntakes.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        propertyId: 'property-1',
        status: 'active',
        memo: '테스트 의뢰',
      }),
    );
  });

  it('registers listing advertisement MCP tools', () => {
    const { service } = createService();

    const toolNames = service.getToolDefinitions().map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'find_listing_advertisements',
        'create_listing_advertisement',
        'update_listing_advertisement',
        'delete_listing_advertisement',
      ]),
    );
  });

  it('delegates create_listing_advertisement to the listing advertisement service', async () => {
    const { service, listingAdvertisements } = createService();

    await service.executeTool(
      'create_listing_advertisement',
      {
        listingId: 'listing-1',
        channel: 'naver',
        status: 'active',
        source: 'manual',
        advertisedPrice: 150000,
        url: 'https://example.com/ad',
      },
      ctx,
    );

    expect(listingAdvertisements.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        listingId: 'listing-1',
        channel: 'naver',
        status: 'active',
        source: 'manual',
        advertisedPrice: 150000,
        url: 'https://example.com/ad',
      }),
    );
  });

  it('delegates update_listing_advertisement to the listing advertisement service', async () => {
    const { service, listingAdvertisements } = createService();

    await service.executeTool(
      'update_listing_advertisement',
      {
        id: 'ad-1',
        status: 'ended',
        endedAt: '2026-05-26T10:00:00.000Z',
        memo: '광고 내림',
      },
      ctx,
    );

    expect(listingAdvertisements.update).toHaveBeenCalledWith(
      'ad-1',
      'office-1',
      expect.objectContaining({
        status: 'ended',
        endedAt: '2026-05-26T10:00:00.000Z',
        memo: '광고 내림',
      }),
    );
  });
});
