import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService', () => {
  const ctx = { officeId: 'office-1', userId: 'user-1', role: 'agent' };

  function createService() {
    const listings = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn().mockResolvedValue({ id: 'listing-1' }),
      update: jest.fn().mockResolvedValue({ id: 'listing-1' }),
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
      addSnapshotListing: jest.fn().mockResolvedValue({ id: 'listing-1' }),
      updateSnapshotListing: jest.fn().mockResolvedValue({ id: 'listing-1' }),
      removeSnapshotListing: jest
        .fn()
        .mockResolvedValue({ id: 'listing-1', result: 'deleted' }),
      batchUpsert: jest.fn().mockResolvedValue({
        received: 1,
        created: 1,
        updated: 0,
        groupsCreated: 1,
        groupsReused: 0,
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
      noop, // parties
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

  it('매물 도구는 화면의 한 줄(의뢰)을 다루고, 거래 조건 도구는 이름에 term이 붙는다', () => {
    const { service } = createService();

    const toolNames = service.getToolDefinitions().map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'find_listings',
        'get_listing',
        'create_listing',
        'update_listing',
        'confirm_listing',
        'close_listing',
        'delete_listing',
        'add_listing_term',
        'update_listing_term',
        'delete_listing_term',
      ]),
    );
    // "매물"이 두 가지로 읽히던 예전 이름은 남기지 않는다
    expect(toolNames.filter((name) => name.includes('listing_intake'))).toEqual([]);
  });

  it('find_listings는 의뢰 목록을 읽어 조건을 terms에 싣는다', async () => {
    const { service, listings, listingIntakes } = createService();
    (listingIntakes as any).findAll = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'intake-1',
          propertyId: 'property-1',
          lifecycleStatus: 'open',
          occupancyStatus: 'vacant',
          listings: [{ id: 'term-1', intakeId: 'intake-1', transactionType: 'sale', price: 150000 }],
        },
      ],
      pagination: { page: 1, limit: 20 },
    });

    const result = await service.executeTool(
      'find_listings',
      { propertyId: 'property-1', transactionType: 'sale', occupancyStatus: 'vacant' },
      ctx,
    );

    expect((listingIntakes as any).findAll).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        propertyId: 'property-1',
        transactionType: 'sale',
        occupancies: ['vacant'],
      }),
    );
    expect(listings.findAll).not.toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text).items).toEqual([
      {
        id: 'intake-1',
        propertyId: 'property-1',
        lifecycleStatus: 'open',
        occupancyStatus: 'vacant',
        terms: [{ id: 'term-1', transactionType: 'sale', price: 150000 }],
      },
    ]);
  });

  it('add_listing_term은 매물 id(listingId)가 꼭 있어야 하고 서비스에는 의뢰 id로 넘긴다', async () => {
    const { service, listings } = createService();

    const missing = await service.executeTool(
      'add_listing_term',
      { propertyId: 'property-1', transactionType: 'sale' },
      ctx,
    );
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain('listingId');
    expect(listings.create).not.toHaveBeenCalled();

    await service.executeTool(
      'add_listing_term',
      { listingId: 'intake-1', propertyId: 'property-1', transactionType: 'sale', price: 150000 },
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

  it('create_listing은 매물(의뢰)을 만들고 terms를 거래 조건으로 넘긴다', async () => {
    const { service, listingIntakes, listings } = createService();

    await service.executeTool(
      'create_listing',
      {
        propertyId: 'property-1',
        lifecycleStatus: 'open',
        memo: '테스트 매물',
        terms: [{ transactionType: 'sale', price: 150000 }],
      },
      ctx,
    );

    expect(listingIntakes.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        propertyId: 'property-1',
        lifecycleStatus: 'open',
        memo: '테스트 매물',
        listings: [{ transactionType: 'sale', price: 150000 }],
      }),
    );
    expect(listings.create).not.toHaveBeenCalled();
  });

  it('응답의 칸 이름을 MCP의 낱말로 옮긴다 (의뢰 → listing, 거래 조건 → term)', async () => {
    const { service, listingIntakes } = createService();
    (listingIntakes as any).findOne = jest.fn().mockResolvedValue({
      id: 'intake-1',
      listings: [{ id: 'term-1', intakeId: 'intake-1', deals: [{ id: 'deal-1', listingId: 'term-1' }] }],
    });

    const result = await service.executeTool('get_listing', { id: 'intake-1' }, ctx);

    expect(JSON.parse(result.content[0].text)).toEqual({
      id: 'intake-1',
      terms: [{ id: 'term-1', listingId: 'intake-1', deals: [{ id: 'deal-1', termId: 'term-1' }] }],
    });
  });

  it('매물 · 조건의 id를 도구가 받지 않는 이름으로 보내면 버리지 않고 거절한다', async () => {
    const { service, listings } = createService();

    // 예전 이름
    const old = await service.executeTool(
      'add_listing_term',
      { intakeId: 'intake-1', listingId: 'intake-1', propertyId: 'property-1', transactionType: 'sale' },
      ctx,
    );
    expect(old.isError).toBe(true);
    expect(old.content[0].text).toContain('listingId로 보내세요');
    expect(listings.create).not.toHaveBeenCalled();

    // 조건을 받는 도구에 매물 id 이름으로 보냄: 걸러지지 않은 목록이 돌아오면 안 된다
    const wrong = await service.executeTool('find_listing_advertisements', { listingId: 'intake-1' }, ctx);
    expect(wrong.isError).toBe(true);
    expect(wrong.content[0].text).toContain('termId');
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
        termId: 'listing-1',
        channel: 'esiljang',
        status: 'active',
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
      accountKey: 'esil-user-1',
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
        termId: 'listing-1',
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


  it('keeps advertising-note tools off unless explicitly enabled', async () => {
    const { service, externalListings } = createService();
    const names = service.getToolDefinitions(ctx).map((tool) => tool.name);

    expect(names.filter((name) => name.includes('external_listing'))).toEqual([]);
    const result = await service.executeTool(
      'batch_upsert_external_listings',
      { sessionId: 'snapshot-1', bundles: [] },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(externalListings.batchUpsert).not.toHaveBeenCalled();
  });

  describe('with advertising-note tools enabled (MCP_EXTERNAL_LISTING_TOOLS=on)', () => {
  const previous = process.env.MCP_EXTERNAL_LISTING_TOOLS;
  beforeEach(() => {
    process.env.MCP_EXTERNAL_LISTING_TOOLS = 'on';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.MCP_EXTERNAL_LISTING_TOOLS;
    else process.env.MCP_EXTERNAL_LISTING_TOOLS = previous;
  });

  it('exposes complete advertising-note snapshot semantics through MCP', async () => {
    const { service, externalListings } = createService();

    const created = await service.executeTool(
      'create_external_listing_snapshot_session',
      { siteId: 'site-1', transactionType: 'sale' },
      ctx,
    );
    const input = await service.executeTool(
      'batch_upsert_external_listings',
      {
        sessionId: 'snapshot-1',
        source: 'agent-file',
        groups: [
          {
            representativeArticleNo: 'A-1',
            listings: [{ articleNo: 'A-1' }, { articleNo: 'A-2' }],
          },
        ],
      },
      ctx,
    );
    const completed = await service.executeTool(
      'complete_external_listing_snapshot_session',
      { id: 'snapshot-1', expectedListingCount: 2 },
      ctx,
    );

    expect(created.isError).toBe(false);
    expect(input.isError).toBe(false);
    expect(completed.isError).toBe(false);
    expect(externalListings.createSession).toHaveBeenCalledWith(
      'office-1',
      'user-1',
      { siteId: 'site-1', transactionType: 'sale' },
    );
    expect(externalListings.batchUpsert).toHaveBeenCalledWith('office-1', {
      sessionId: 'snapshot-1',
      source: 'agent-file',
      batchId: undefined,
      groups: [
        {
          representativeArticleNo: 'A-1',
          listings: [{ articleNo: 'A-1' }, { articleNo: 'A-2' }],
        },
      ],
    });
    expect(externalListings.completeSession).toHaveBeenCalledWith(
      'office-1',
      'user-1',
      'agent',
      'snapshot-1',
      { expectedListingCount: 2 },
    );
  });

  it('edits listings inside an open advertising-note snapshot', async () => {
    const { service, externalListings } = createService();

    const added = await service.executeTool(
      'add_external_listing_to_snapshot_group',
      {
        sessionId: 'snapshot-1',
        groupId: 'group-1',
        source: 'agent-file',
        listing: { articleNo: 'A-3' },
      },
      ctx,
    );
    const updated = await service.executeTool(
      'update_external_listing_in_snapshot',
      { sessionId: 'snapshot-1', listingId: 'listing-1', price: 90000 },
      ctx,
    );
    const removed = await service.executeTool(
      'remove_external_listing_from_snapshot',
      { sessionId: 'snapshot-1', listingId: 'listing-1' },
      ctx,
    );

    expect([added, updated, removed].map((r) => r.isError)).toEqual([
      false,
      false,
      false,
    ]);
    expect(externalListings.addSnapshotListing).toHaveBeenCalledWith(
      'office-1',
      'snapshot-1',
      'group-1',
      { source: 'agent-file', listing: { articleNo: 'A-3' } },
    );
    expect(externalListings.updateSnapshotListing).toHaveBeenCalledWith(
      'office-1',
      'snapshot-1',
      'listing-1',
      { price: 90000 },
    );
    expect(externalListings.removeSnapshotListing).toHaveBeenCalledWith(
      'office-1',
      'snapshot-1',
      'listing-1',
    );
  });

  it('refuses to close an advertising-note snapshot without a declared count', async () => {
    const { service, externalListings } = createService();

    const result = await service.executeTool(
      'complete_external_listing_snapshot_session',
      { id: 'snapshot-1' },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(externalListings.completeSession).not.toHaveBeenCalled();
  });

  it('does not describe advertising-note tools around a specific provider', () => {
    const { service } = createService();
    const tools = service
      .getToolDefinitions(ctx)
      .filter((tool) => tool.name.includes('external_listing'));

    expect(tools.length).toBeGreaterThan(0);
    expect(JSON.stringify(tools)).not.toMatch(/네이버|크롤|수집|naver|seango|epju/i);
  });
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

  describe('입주 가능 시기', () => {
    const LISTING_ID = '00000000-0000-4000-8000-0000000000e1';
    const schemaOf = (service: { getToolDefinitions: () => Array<{ name: string; inputSchema: any }> }, name: string) =>
      service.getToolDefinitions().find((tool) => tool.name === name)!.inputSchema.properties;

    it('고치는 도구에도 입주 칸이 있고, 값의 종류와 뜻이 스키마에 적혀 있다', () => {
      const { service } = createService();
      for (const tool of ['update_listing_term', 'add_listing_term']) {
        const props = schemaOf(service as never, tool);
        expect(props.moveInAvailableType.enum).toEqual([
          'immediate',
          'date',
          'range',
          'negotiable',
          'unknown',
        ]);
        // "협의"가 어떤 값인지 AI가 스키마만 보고 알 수 있어야 한다
        expect(props.moveInAvailableType.description).toContain('negotiable=협의');
        expect(props).toHaveProperty('moveInAvailableFrom');
        expect(props).toHaveProperty('moveInAvailableTo');
      }
    });

    it('협의로 바꾸면 예전 날짜를 비운다 (의뢰를 지우고 다시 만들 필요가 없다)', async () => {
      const { service, listings } = createService();
      const result = await service.executeTool(
        'update_listing_term',
        { id: LISTING_ID, moveInAvailableType: 'negotiable' },
        ctx as never,
      );
      expect(result.isError).toBe(false);
      expect(listings.update).toHaveBeenCalledWith(
        LISTING_ID,
        'office-1',
        expect.objectContaining({
          moveInAvailableType: 'negotiable',
          moveInAvailableFrom: null,
          moveInAvailableTo: null,
        }),
      );
    });

    it('특정일 이후는 시작일만, 기간 협의는 양쪽 날짜를 넘긴다', async () => {
      const { service, listings } = createService();
      await service.executeTool(
        'update_listing_term',
        { id: LISTING_ID, moveInAvailableType: 'date', moveInAvailableFrom: '2027-03-01', moveInAvailableTo: '2027-04-01' },
        ctx as never,
      );
      expect(listings.update.mock.calls[0][2]).toMatchObject({
        moveInAvailableType: 'date',
        moveInAvailableFrom: '2027-03-01',
        moveInAvailableTo: null,
      });
      await service.executeTool(
        'update_listing_term',
        { id: LISTING_ID, moveInAvailableType: 'range', moveInAvailableFrom: '2027-03-01', moveInAvailableTo: '2027-04-01' },
        ctx as never,
      );
      expect(listings.update.mock.calls[1][2]).toMatchObject({
        moveInAvailableFrom: '2027-03-01',
        moveInAvailableTo: '2027-04-01',
      });
    });

    it('입주 칸을 보내지 않으면 입주 시기는 건드리지 않는다', async () => {
      const { service, listings } = createService();
      await service.executeTool('update_listing_term', { id: LISTING_ID, price: 100000 }, ctx as never);
      const patch = listings.update.mock.calls[0][2];
      expect(patch.moveInAvailableType).toBeUndefined();
      expect(patch.moveInAvailableFrom).toBeUndefined();
      expect(patch.moveInAvailableTo).toBeUndefined();
    });

    it('목록에 없는 값은 서비스에 닿기 전에 거절하고 고를 수 있는 값을 알려 준다', async () => {
      const { service, listings } = createService();
      const result = await service.executeTool(
        'update_listing_term',
        { id: LISTING_ID, moveInAvailableType: '협의' },
        ctx as never,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('negotiable');
      expect(listings.update).not.toHaveBeenCalled();
    });
  });

  it('does not turn an unanswered call into a confirmed listing', async () => {
    const { service, listingIntakes } = createService();
    (listingIntakes as any).confirm = jest.fn().mockResolvedValue({ id: 'intake-1' });
    const INTAKE_ID = '00000000-0000-4000-8000-0000000000e2';

    // 예전 도구 정의대로 result를 보내도 버리지 않고 서비스에 넘긴다 — 서비스가 유효함 말고는 거절한다
    await service.executeTool('confirm_listing', { id: INTAKE_ID, result: 'no_answer' }, ctx as never);
    expect((listingIntakes as any).confirm.mock.calls[0][3].result).toBe('no_answer');

    // 결과를 보내지 않으면 유효함으로 찍는 것이다
    await service.executeTool('confirm_listing', { id: INTAKE_ID }, ctx as never);
    expect((listingIntakes as any).confirm.mock.calls[1][3].result).toBeUndefined();
  });
});
