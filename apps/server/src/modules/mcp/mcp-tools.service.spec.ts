import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService', () => {
  const ctx = { officeId: 'office-1', userId: 'user-1', role: 'agent' };

  function createService() {
    const listings = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn().mockResolvedValue({ id: 'listing-1' }),
    };
    const properties = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
    };
    const listingAdvertisements = {
      findAll: jest
        .fn()
        .mockResolvedValue({ items: [], pagination: { total: 0 } }),
      create: jest.fn().mockResolvedValue({ id: 'ad-1' }),
      update: jest.fn().mockResolvedValue({ id: 'ad-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'ad-1' }),
    };
    const listingIntakes = {
      findAll: jest
        .fn()
        .mockResolvedValue({ items: [], pagination: { total: 0 } }),
      findOne: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      create: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      update: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      remove: jest
        .fn()
        .mockResolvedValue({ id: 'intake-1', status: 'cancelled' }),
    };
    const contracts = {
      prepareSaleContractDraft: jest.fn().mockResolvedValue({
        document: {
          id: 'document-1',
          title: '부동산 매매계약서',
          status: 'draft',
        },
        revision: {
          id: 'revision-1',
          revisionNo: 1,
          contentHash: 'a'.repeat(64),
          payload: { contractAgreement: { schemaVersion: 1 } },
        },
        validation: { errors: [], warnings: [], isReadyForGeneration: true },
      }),
      validateSaleContractDraft: jest.fn().mockResolvedValue({
        errors: [],
        warnings: [],
        isReadyForGeneration: true,
      }),
    };
    const tasks = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'task-1' }),
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
      update: jest.fn().mockResolvedValue({ id: 'task-1' }),
      claim: jest.fn().mockResolvedValue({
        id: 'task-1',
        category: 'advertisement',
        status: 'in_progress',
      }),
    };
    const externalListings = {
      getActiveSession: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({ id: 'snapshot-1' }),
      completeSession: jest.fn().mockResolvedValue({
        session: { id: 'snapshot-1', status: 'completed' },
        staleListingsMarked: 0,
      }),
      cancelSession: jest.fn().mockResolvedValue({
        id: 'snapshot-1',
        status: 'cancelled',
      }),
      batchUpsert: jest.fn().mockResolvedValue({
        received: 1,
        created: 1,
        updated: 0,
        groupsCreated: 1,
        groupsReused: 0,
        errors: [],
      }),
    };
    const listingAdvertisementSnapshots = {
      begin: jest.fn().mockResolvedValue({
        session: { id: 'cp-snapshot-1', status: 'processing' },
        reused: false,
      }),
      submitItem: jest.fn().mockResolvedValue({
        item: { id: 'cp-snapshot-item-1', status: 'resolved' },
        progress: { receivedCount: 1, resolvedCount: 1 },
      }),
      get: jest.fn().mockResolvedValue({
        session: { id: 'cp-snapshot-1', status: 'processing' },
      }),
      complete: jest.fn().mockResolvedValue({
        sessionId: 'cp-snapshot-1',
        status: 'completed',
      }),
      cancel: jest.fn().mockResolvedValue({
        id: 'cp-snapshot-1',
        status: 'cancelled',
      }),
    };
    const noop = {};

    const service = new (McpToolsService as any)(
      listings,
      noop, // contacts
      properties,
      noop, // deals
      noop, // buyerReqs
      noop, // consultations
      noop, // matches
      contracts,
      tasks,
      noop, // calendarEvents
      noop, // sites
      noop, // dongs
      noop, // units
      noop, // officeSites
      noop, // propertyContacts
      noop, // contactRelations
      noop, // tenants
      noop, // employees
      noop, // offices
      externalListings,
      noop, // commissionPayments
      noop, // cashflow
      noop, // publicDocs
      noop, // propertyPhotos
      listingAdvertisements,
      noop, // officeAdvertisements
      listingIntakes,
      listingAdvertisementSnapshots,
    ) as McpToolsService;

    return {
      service,
      listings,
      properties,
      listingAdvertisements,
      listingIntakes,
      contracts,
      tasks,
      externalListings,
      listingAdvertisementSnapshots,
    };
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

  it('exposes exact Property and Listing lookup filters for snapshot resolution', async () => {
    const { service, properties, listings } = createService();

    await service.executeTool(
      'find_properties',
      { siteId: 'site-1', unitId: 'unit-1' },
      ctx,
    );
    await service.executeTool(
      'find_listings',
      {
        propertyId: 'property-1',
        transactionType: 'sale',
        includeClosed: false,
      },
      ctx,
    );

    expect(properties.findAll).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({ siteId: 'site-1', unitId: 'unit-1' }),
    );
    expect(listings.findAll).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        propertyId: 'property-1',
        transactionType: 'sale',
      }),
    );
  });

  it('delegates create_listing_intake to the listing intake service', async () => {
    const { service, listingIntakes } = createService();

    await service.executeTool(
      'create_listing_intake',
      {
        propertyId: 'property-1',
        lifecycleStatus: 'open',
        memo: '테스트 의뢰',
      },
      ctx,
    );

    expect(listingIntakes.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        propertyId: 'property-1',
        lifecycleStatus: 'open',
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
        channel: 'esiljang',
        status: 'active',
        source: 'cp_sync',
        advertisedPrice: 150000,
        url: 'https://www.aipartner.com/advertisements/cp-100',
        externalAdId: 'cp-100',
        naverArticleNo: '2412345678',
        naverUrl: 'https://fin.land.naver.com/articles/2412345678',
      },
      ctx,
    );

    expect(listingAdvertisements.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        listingId: 'listing-1',
        channel: 'esiljang',
        status: 'active',
        source: 'cp_sync',
        advertisedPrice: 150000,
        url: 'https://www.aipartner.com/advertisements/cp-100',
        externalAdId: 'cp-100',
        naverArticleNo: '2412345678',
        naverUrl: 'https://fin.land.naver.com/articles/2412345678',
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

  it('registers the one-item CP advertisement snapshot workflow', () => {
    const { service } = createService();
    const names = service.getToolDefinitions().map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'begin_listing_advertisement_snapshot',
        'submit_listing_advertisement_snapshot_item',
        'get_listing_advertisement_snapshot',
        'complete_listing_advertisement_snapshot',
        'cancel_listing_advertisement_snapshot',
      ]),
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        'append_listing_advertisement_snapshot_items',
        'claim_listing_advertisement_snapshot_item',
        'resolve_listing_advertisement_snapshot_item',
        'fail_listing_advertisement_snapshot_item',
        'retry_listing_advertisement_snapshot_item',
      ]),
    );
  });

  it('delegates one resolved CP snapshot item in a single call', async () => {
    const { service, listingAdvertisementSnapshots } = createService();
    const metadata = {
      channel: 'esiljang',
      provider: 'esiljang',
      scope: 'active_advertisements',
      observedAt: '2026-08-04T14:48:01.956Z',
      expectedTotal: 1,
      manifestHash: 'a'.repeat(64),
      activeFilter: { dataValue: 'ad', selected: true, count: 1 },
      paginationComplete: true,
      visitedPages: [1],
    };

    await service.executeTool(
      'begin_listing_advertisement_snapshot',
      metadata,
      ctx,
    );
    await service.executeTool(
      'submit_listing_advertisement_snapshot_item',
      {
        sessionId: 'cp-snapshot-1',
        raw: {
          externalAdId: '64850265',
          provider: 'esiljang',
          observedAt: '2026-08-04T14:48:01.956Z',
          sourcePage: 1,
        },
        listingId: 'listing-1',
        resolution: { siteId: 'site-1', unitId: 'unit-1' },
      },
      ctx,
    );

    expect(listingAdvertisementSnapshots.begin).toHaveBeenCalledWith(
      'office-1',
      'user-1',
      expect.objectContaining(metadata),
    );
    expect(listingAdvertisementSnapshots.submitItem).toHaveBeenCalledWith(
      'office-1',
      'user-1',
      'agent',
      expect.objectContaining({
        sessionId: 'cp-snapshot-1',
        listingId: 'listing-1',
        raw: expect.objectContaining({ externalAdId: '64850265' }),
      }),
    );
  });

  it('registers sale contract draft preparation and validation tools', () => {
    const { service } = createService();
    const definitions = service.getToolDefinitions();

    expect(definitions.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'prepare_sale_contract_draft',
        'validate_sale_contract_draft',
      ]),
    );
    expect(
      definitions.find((tool) => tool.name === 'prepare_sale_contract_draft')
        ?.description,
    ).toContain('불변 revision');
  });

  it('delegates sale contract draft preparation without completing the document', async () => {
    const { service, contracts } = createService();

    const result = await service.executeTool(
      'prepare_sale_contract_draft',
      {
        contractId: 'contract-1',
        actualAgreementAt: '2026-07-20',
        conditions: '잔금 지급과 동시에 인도한다.',
        rightsTransferDetails: '잔금과 동시에 근저당을 말소한다.',
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(contracts.prepareSaleContractDraft).toHaveBeenCalledWith(
      'contract-1',
      'office-1',
      'user-1',
      expect.objectContaining({
        actualAgreementAt: '2026-07-20',
        conditions: '잔금 지급과 동시에 인도한다.',
        rightsTransferDetails: '잔금과 동시에 근저당을 말소한다.',
      }),
      'agent:contract-writer',
    );
  });

  it('uses ordinary Tasks as the advertisement work contract', async () => {
    const { service, tasks } = createService();

    const found = await service.executeTool(
      'find_tasks',
      { category: 'advertisement', status: 'pending' },
      ctx,
    );
    const claimed = await service.executeTool(
      'claim_task',
      { id: 'task-1' },
      ctx,
    );

    expect(found.isError).toBe(false);
    expect(claimed.isError).toBe(false);
    expect(tasks.findAll).toHaveBeenCalledWith('office-1', {
      category: 'advertisement',
      status: 'pending',
      assignedToId: undefined,
    });
    expect(tasks.claim).toHaveBeenCalledWith(
      'task-1',
      'office-1',
      'user-1',
    );
  });

  it('does not expose a server-side agent queue or action-request workflow', () => {
    const { service } = createService();
    const names = service.getToolDefinitions(ctx).map((tool) => tool.name);

    expect(names).not.toContain('agent_start_session');
    expect(names).not.toContain('agent_claim_wakeup');
    expect(names).not.toContain('create_agent_action_request');
    expect(names).not.toContain('record_agent_action_execution');
    expect(names).not.toContain('find_external_listing_sources');
  });


  it('exposes complete advertising-note snapshot semantics through MCP', async () => {
    const { service, externalListings } = createService();

    const created = await service.executeTool(
      'create_external_listing_snapshot_session',
      { siteId: 'site-1', transactionType: 'sale' },
      ctx,
    );
    const completed = await service.executeTool(
      'complete_external_listing_snapshot_session',
      { id: 'snapshot-1' },
      ctx,
    );

    expect(created.isError).toBe(false);
    expect(completed.isError).toBe(false);
    expect(externalListings.createSession).toHaveBeenCalledWith(
      'office-1',
      'user-1',
      { siteId: 'site-1', transactionType: 'sale' },
    );
    expect(externalListings.completeSession).toHaveBeenCalledWith(
      'office-1',
      'user-1',
      'agent',
      'snapshot-1',
    );
  });


  it('delegates sale contract draft validation as a read-only tool', async () => {
    const { service, contracts } = createService();

    const result = await service.executeTool(
      'validate_sale_contract_draft',
      { contractId: 'contract-1' },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(contracts.validateSaleContractDraft).toHaveBeenCalledWith(
      'contract-1',
      'office-1',
    );
    expect(contracts.prepareSaleContractDraft).not.toHaveBeenCalled();
  });
});
