import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService', () => {
  const ctx = { officeId: 'office-1', userId: 'user-1', role: 'agent' };

  function createService() {
    const listings = {
      create: jest.fn().mockResolvedValue({ id: 'listing-1' }),
    };
    const listingAdvertisements = {
      findAll: jest
        .fn()
        .mockResolvedValue({ items: [], pagination: { total: 0 } }),
      create: jest.fn().mockResolvedValue({ id: 'ad-1' }),
      update: jest.fn().mockResolvedValue({ id: 'ad-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'ad-1' }),
      handleAgentRunCompletion: jest.fn().mockResolvedValue(null),
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
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
      update: jest.fn().mockResolvedValue({ id: 'task-1' }),
    };
    const controlPlane = {
      getOrCreateSession: jest.fn().mockResolvedValue({
        id: 'session-1',
        taskId: null,
      }),
      updateSession: jest
        .fn()
        .mockImplementation(
          async (
            _officeId: string,
            _sessionId: string,
            input: Record<string, unknown>,
          ) => ({
            id: 'session-1',
            taskId: input.taskId ?? 'task-1',
            ...input,
          }),
        ),
      appendActivity: jest.fn().mockResolvedValue({ id: 'activity-1' }),
      completeRun: jest.fn().mockResolvedValue({
        id: 'agent-run-1',
        status: 'completed',
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
    const agentActionRequests = {
      create: jest.fn().mockResolvedValue({
        id: 'agent-action-1',
        contentHash: 'a'.repeat(64),
      }),
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ id: 'agent-action-1' }),
      recordExecution: jest.fn().mockResolvedValue({
        id: 'agent-action-1',
        executionStatus: 'succeeded',
        verificationStatus: 'matched',
      }),
      reportBlocker: jest.fn().mockResolvedValue({
        id: 'agent-action-1',
        executionStatus: 'needs_input',
        escalationTaskId: 'task-1',
      }),
      withdraw: jest.fn().mockResolvedValue({
        id: 'agent-action-1',
        reviewStatus: 'withdrawn',
      }),
    };
    const externalListingSources = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'source-1',
          siteId: 'site-1',
          provider: 'naver',
          externalCode: '113907',
          type: 'apartment',
          isEnabled: true,
        },
      ]),
    };
    const noop = {};

    const service = new (McpToolsService as any)(
      listings,
      noop, // contacts
      noop, // properties
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
      externalListingSources,
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
      controlPlane,
      agentActionRequests,
    ) as McpToolsService;

    return {
      service,
      listings,
      listingAdvertisements,
      listingIntakes,
      contracts,
      tasks,
      controlPlane,
      externalListings,
      externalListingSources,
      agentActionRequests,
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

  it('delegates find_external_listing_sources to the collection source service', async () => {
    const { service, externalListingSources } = createService();

    const result = await service.executeTool(
      'find_external_listing_sources',
      { provider: 'naver', isEnabled: true },
      ctx,
    );

    expect(externalListingSources.findAll).toHaveBeenCalledWith('office-1', {
      provider: 'naver',
      isEnabled: true,
    });
    // 스킬이 siteId → complexNo 매핑을 읽으려면 이 세 필드가 반드시 나와야 한다.
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('113907');
    expect(result.content[0].text).toContain('site-1');
    expect(result.content[0].text).toContain('apartment');
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

  it('registers the durable agent run protocol tools', () => {
    const { service } = createService();
    expect(service.getToolDefinitions().map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'agent_start_session',
        'agent_claim_wakeup',
        'agent_renew_run',
        'agent_append_activity',
        'agent_complete_run',
      ]),
    );
  });

  it('starts an agent session for an AgentActionRequest without a Task', async () => {
    const { service, controlPlane } = createService();

    const result = await service.executeTool(
      'agent_start_session',
      {
        agentKey: 'esiljang-ad-manager',
        taskKey: 'agent-action:agent-action-1',
        agentActionRequestId: 'agent-action-1',
        context: { articleNo: '2412345678' },
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(controlPlane.getOrCreateSession).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        taskId: undefined,
        agentActionRequestId: 'agent-action-1',
      }),
    );
  });

  it('advances an advertisement workflow after the linked agent run completes', async () => {
    const { service, controlPlane, listingAdvertisements } = createService();

    const result = await service.executeTool(
      'agent_complete_run',
      {
        runId: 'agent-run-1',
        outcome: 'completed',
        result: { processedCount: 12, totalCount: 12 },
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(controlPlane.completeRun).toHaveBeenCalledWith(
      'office-1',
      'agent-run-1',
      'mcp:user-1',
      expect.objectContaining({ outcome: 'completed' }),
    );
    expect(
      listingAdvertisements.handleAgentRunCompletion,
    ).toHaveBeenCalledWith('office-1', 'agent-run-1');
  });

  it('exposes proposal and approved execution tools but no MCP approval tool', () => {
    const { service } = createService();
    const names = service.getToolDefinitions(ctx).map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'create_agent_action_request',
        'list_agent_action_requests',
        'get_agent_action_request',
        'withdraw_agent_action_request',
        'record_agent_action_execution',
        'report_agent_action_blocker',
        'create_external_listing_snapshot_session',
        'complete_external_listing_snapshot_session',
        'cancel_external_listing_snapshot_session',
      ]),
    );
    expect(names).not.toContain('approve_agent_action_request');
    expect(names).not.toContain('reject_agent_action_request');
    expect(names).not.toContain('verify_agent_action_request');
  });

  it('hides scoped agent action tools from a role without advertisement scopes', () => {
    const { service } = createService();
    const names = service
      .getToolDefinitions({
        officeId: 'office-1',
        userId: 'user-1',
        role: 'unknown',
      })
      .map((tool) => tool.name);

    expect(names).not.toContain('create_agent_action_request');
    expect(names).not.toContain('list_agent_action_requests');
  });

  it('creates an attended computer-use exact-hash request through MCP', async () => {
    const { service, agentActionRequests } = createService();

    const result = await service.executeTool(
      'create_agent_action_request',
      {
        reviewerId: 'reviewer-1',
        listingAdvertisementId: 'listing-ad-1',
        capability: 'advertisement.terms.set',
        rationale: '네이버 가격이 ERP 확정가와 다릅니다.',
        payload: { advertisedPrice: 158000 },
        sourceSkillKey: 'naver-real-estate-reader',
        sourceSkillVersion: '0.1.0',
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(agentActionRequests.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        reviewerId: 'reviewer-1',
        executionMode: 'manual',
        executorSkillVersion: 'computer-use-v1',
        capability: 'advertisement.terms.set',
      }),
      expect.objectContaining({
        actor: 'mcp:user-1',
        source: 'mcp',
        role: 'agent',
      }),
    );
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

  it('records an approved computer-use execution without exposing approval', async () => {
    const { service, agentActionRequests } = createService();

    const result = await service.executeTool(
      'record_agent_action_execution',
      {
        id: 'agent-action-1',
        contentHash: 'a'.repeat(64),
        version: 2,
        note: '이실장 가격 조건 저장 완료',
        receipt: {
          operationKey: 'op-1',
          articleNo: '2412345678',
          observedAt: '2026-07-28T00:00:00.000Z',
          observedAfter: {
            isActive: true,
            price: 158000,
            deposit: null,
            monthlyRent: null,
          },
          screenshotArtifactId: 'shot-1',
        },
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(agentActionRequests.recordExecution).toHaveBeenCalledWith(
      'office-1',
      'agent-action-1',
      expect.objectContaining({
        contentHash: 'a'.repeat(64),
        version: 2,
        receipt: expect.objectContaining({ operationKey: 'op-1' }),
      }),
      expect.objectContaining({
        actor: 'mcp:user-1',
        source: 'mcp',
        role: 'agent',
      }),
    );
  });

  it('escalates a computer-use blocker to a human Task through MCP', async () => {
    const { service, agentActionRequests } = createService();

    const result = await service.executeTool(
      'report_agent_action_blocker',
      {
        id: 'agent-action-1',
        contentHash: 'a'.repeat(64),
        version: 2,
        reasonCode: 'captcha',
        summary: 'CAPTCHA가 나타나 직원 확인이 필요합니다.',
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(agentActionRequests.reportBlocker).toHaveBeenCalledWith(
      'office-1',
      'agent-action-1',
      expect.objectContaining({
        reasonCode: 'captcha',
        version: 2,
      }),
      expect.objectContaining({
        actor: 'mcp:user-1',
        source: 'mcp',
      }),
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
