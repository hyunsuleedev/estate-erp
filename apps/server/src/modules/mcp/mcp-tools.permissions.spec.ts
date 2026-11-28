import { EmployeesService } from '../employees/employees.service';
import { assertCanDeleteListing } from '../listings/listing-input';
import { McpToolsService } from './mcp-tools.service';

/**
 * MCP 도구는 화면(REST)과 같은 권한을 따른다.
 * 서비스를 바로 부르면 컨트롤러가 하던 가리기·역할 검사를 건너뛰게 되므로, 도구마다 따로 확인한다.
 */
describe('McpToolsService 권한', () => {
  const agent = { officeId: 'office-1', userId: 'agent-1', role: 'agent' };
  const owner = { officeId: 'office-1', userId: 'owner-1', role: 'owner' };

  const staff = [
    { id: 'owner-1', name: '대표', role: 'owner', payType: 'salary', baseSalary: 5_000_000, commissionRate: 0 },
    { id: 'manager-1', name: '매니저', role: 'manager', payType: 'commission', baseSalary: 0, commissionRate: 40 },
    { id: 'agent-1', name: '중개사', role: 'agent', payType: 'commission', baseSalary: 1_000_000, commissionRate: 60 },
  ];

  function createService() {
    const employees = {
      findAll: jest.fn().mockResolvedValue(staff),
      findOne: jest.fn((id: string) => Promise.resolve(staff.find((row) => row.id === id))),
      findProfile: jest.fn((id: string) => Promise.resolve(staff.find((row) => row.id === id))),
      findSection: jest.fn().mockResolvedValue([]),
      // 가리는 규칙은 실제 구현을 쓴다
      forViewer: EmployeesService.prototype.forViewer,
      sectionForViewer: EmployeesService.prototype.sectionForViewer,
    };
    const commissionPayments = {
      listByOffice: jest.fn().mockResolvedValue([]),
      listByDeal: jest.fn().mockResolvedValue([]),
    };
    const cashflow = {
      getSummary: jest.fn().mockResolvedValue({
        collected: 700,
        partnerShare: 100,
        receivable: 2202,
        monthly: [{ month: '2026-11', collected: 700, partnerShare: 100 }],
      }),
    };
    const deals = {
      create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'deal-1' }),
    };
    const noop = {};
    const listings = {
      // 지우는 권한은 실제 규칙을 쓴다(대표·매니저만)
      remove: jest.fn(async (id: string, _officeId: string, role?: string | null) => {
        assertCanDeleteListing(role);
        return { id, intakeRemoved: false };
      }),
    };

    const listingIntakes = {
      remove: jest.fn(async (id: string, _officeId: string, role?: string | null) => {
        assertCanDeleteListing(role);
        return { id, propertyId: 'property-1', deletedListingIds: ['listing-1'] };
      }),
      close: jest.fn().mockResolvedValue({ id: 'intake-1', lifecycleStatus: 'closed' }),
    };

    const service = new (McpToolsService as any)(
      listings,
      noop, // contacts
      noop, // properties
      deals,
      noop, // buyerReqs
      noop, // consultations
      noop, // matches
      noop, // contracts
      noop, // tasks
      noop, // calendarEvents
      noop, // sites
      noop, // dongs
      noop, // units
      noop, // officeSites
      noop, // propertyContacts
      noop, // parties
      noop, // tenants
      employees,
      noop, // offices
      noop, // externalListings
      commissionPayments,
      cashflow,
      noop, // publicDocs
      noop, // propertyPhotos
      noop, // listingAdvertisements
      noop, // officeAdvertisements
      listingIntakes,
      noop, // listingAdvertisementSnapshots
    ) as McpToolsService;

    return { service, employees, commissionPayments, cashflow, deals, listings, listingIntakes };
  }

  const parse = (result: { content: Array<{ text?: string }> }) =>
    JSON.parse(result.content[0]?.text ?? 'null');

  it('중개사에게는 다른 직원의 급여·배분율을 가린다 (find_employees)', async () => {
    const { service } = createService();

    const rows = parse(await service.executeTool('find_employees', {}, agent));

    const manager = rows.find((row: { id: string }) => row.id === 'manager-1');
    expect(manager.payVisible).toBe(false);
    expect(manager.commissionRate).toBeNull();
    expect(manager.baseSalary).toBeNull();
    expect(manager.payType).toBeNull();
    // 본인 것은 본다
    const self = rows.find((row: { id: string }) => row.id === 'agent-1');
    expect(self.payVisible).toBe(true);
    expect(self.commissionRate).toBe(60);
  });

  it('중개사에게는 다른 직원의 급여·배분율을 가린다 (get_employee)', async () => {
    const { service } = createService();

    const row = parse(await service.executeTool('get_employee', { id: 'manager-1' }, agent));

    expect(row.payVisible).toBe(false);
    expect(row.commissionRate).toBeNull();
  });

  it('get_employee는 기본 정보만 주고, include에 적은 목록만 따로 읽어 붙인다', async () => {
    const { service, employees } = createService();
    employees.findSection.mockImplementation((_id: string, _office: string, section: string) =>
      Promise.resolve(
        section === 'deals' ? [{ id: 'part-1', commissionAmount: 100, commissionRate: 50 }] : [{ id: `${section}-1` }],
      ),
    );

    const base = parse(await service.executeTool('get_employee', { id: 'manager-1' }, owner));
    expect(base.name).toBe('매니저');
    expect(employees.findSection).not.toHaveBeenCalled();
    expect(base).not.toHaveProperty('assignedTasks');

    const withLists = parse(
      await service.executeTool('get_employee', { id: 'manager-1', include: 'tasks, deals' }, owner),
    );
    expect(withLists.assignedTasks).toEqual([{ id: 'tasks-1' }]);
    expect(withLists.dealParticipants[0].commissionAmount).toBe(100);
    expect(withLists).not.toHaveProperty('recentActivities');
    expect(employees.findSection).toHaveBeenCalledTimes(2);

    // 중개사에게는 남의 거래 수수료를 가리고 정산 내역을 비운다
    const asAgent = parse(
      await service.executeTool('get_employee', { id: 'manager-1', include: 'deals,settlements' }, agent),
    );
    // 가려진 칸은 빈 값이라 줄인 응답에서는 빠진다
    expect(asAgent.dealParticipants[0]).toEqual({ id: 'part-1' });
    expect(asAgent.recentSettlementLines).toEqual([]);

    const wrong = await service.executeTool('get_employee', { id: 'manager-1', include: 'salary' }, owner);
    expect(wrong.isError).toBe(true);
  });

  it('대표는 급여·배분율을 본다', async () => {
    const { service } = createService();

    const rows = parse(await service.executeTool('find_employees', {}, owner));

    expect(rows.find((row: { id: string }) => row.id === 'manager-1').commissionRate).toBe(40);
  });

  it('캐시플로우 요약은 대표·매니저만 받는다', async () => {
    const { service, cashflow } = createService();

    const refused = await service.executeTool('get_cashflow_summary', { year: 2026, month: 11 }, agent);
    expect(refused.isError).toBe(true);
    expect(cashflow.getSummary).not.toHaveBeenCalled();

    const allowed = await service.executeTool('get_cashflow_summary', { year: 2026, month: 11 }, owner);
    expect(allowed.isError).toBeFalsy();
    expect(cashflow.getSummary).toHaveBeenCalledWith('office-1', 2026, 11);
  });

  it('수수료 청구 조회에 보는 사람을 넘긴다 (중개사는 담당 거래만)', async () => {
    const { service, commissionPayments } = createService();

    await service.executeTool('find_commission_payments', {}, agent);
    expect(commissionPayments.listByOffice).toHaveBeenCalledWith(
      'office-1',
      expect.anything(),
      { userId: 'agent-1', role: 'agent' },
    );

    await service.executeTool('find_commission_payments', { dealId: 'deal-1' }, agent);
    expect(commissionPayments.listByDeal).toHaveBeenCalledWith('office-1', 'deal-1', {
      userId: 'agent-1',
      role: 'agent',
    });
  });

  it('거래를 만들 때 만든 사람을 넘겨 담당이 채워지게 한다', async () => {
    const { service, deals } = createService();

    await service.executeTool('create_deal', { termId: 'listing-1' }, agent);

    expect(deals.create).toHaveBeenCalledWith('office-1', expect.anything(), {
      userId: 'agent-1',
      role: 'agent',
    });
  });

  it('거래 조회에 보는 사람을 넘긴다 (담당 아닌 거래의 수수료를 싣지 않게)', async () => {
    const { service, deals } = createService();

    await service.executeTool('find_deals', {}, agent);
    expect(deals.findAll).toHaveBeenCalledWith('office-1', expect.any(Object), {
      userId: 'agent-1',
      role: 'agent',
    });

    await service.executeTool('get_deal', { id: 'deal-1' }, agent);
    expect(deals.findOne).toHaveBeenCalledWith('deal-1', 'office-1', {
      userId: 'agent-1',
      role: 'agent',
    });
  });

  it('매물 삭제는 대표·매니저만 한다 (delete_listing_term)', async () => {
    const { service, listings } = createService();

    const refused = await service.executeTool('delete_listing_term', { id: 'listing-1' }, agent);
    expect(listings.remove).toHaveBeenLastCalledWith('listing-1', 'office-1', 'agent');
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain('대표·매니저만');

    const done = await service.executeTool('delete_listing_term', { id: 'listing-1' }, owner);
    expect(done.isError).toBe(false);
    expect(parse(done)).toEqual({ id: 'listing-1', intakeRemoved: false });
  });

  it('역할을 모르는 연결은 매물을 지우지 못한다 (서버 안쪽 호출로 보이지 않게)', async () => {
    const { service, listings } = createService();

    const result = await service.executeTool(
      'delete_listing_term',
      { id: 'listing-1' },
      { officeId: 'office-1', userId: 'someone' },
    );
    expect(listings.remove).toHaveBeenLastCalledWith('listing-1', 'office-1', null);
    expect(result.isError).toBe(true);
  });

  it('의뢰 삭제는 대표·매니저만 하고, 실제로 지우는 쪽을 부른다 (delete_listing)', async () => {
    const { service, listingIntakes } = createService();

    const refused = await service.executeTool('delete_listing', { id: 'intake-1' }, agent);
    expect(listingIntakes.remove).toHaveBeenLastCalledWith('intake-1', 'office-1', 'agent');
    expect(refused.isError).toBe(true);

    const unknownRole = await service.executeTool(
      'delete_listing',
      { id: 'intake-1' },
      { officeId: 'office-1', userId: 'someone' },
    );
    expect(listingIntakes.remove).toHaveBeenLastCalledWith('intake-1', 'office-1', null);
    expect(unknownRole.isError).toBe(true);

    const done = await service.executeTool('delete_listing', { id: 'intake-1' }, owner);
    expect(parse(done)).toEqual({
      id: 'intake-1',
      propertyId: 'property-1',
      deletedListingIds: ['listing-1'],
    });
    expect(listingIntakes.close).not.toHaveBeenCalled();
  });

  it('의뢰 종료는 지우지 않고 종료만 하며 누구나 할 수 있다 (close_listing)', async () => {
    const { service, listingIntakes } = createService();

    const result = await service.executeTool(
      'close_listing',
      { id: 'intake-1', closedReason: 'withdrawn' },
      agent,
    );
    expect(result.isError).toBe(false);
    expect(listingIntakes.close).toHaveBeenCalledWith('intake-1', 'office-1', 'withdrawn');
    expect(listingIntakes.remove).not.toHaveBeenCalled();
  });

  it('대표·매니저에게는 캐시플로우 요약을 그대로 돌려준다', async () => {
    const { service } = createService();

    const summary = parse(
      await service.executeTool('get_cashflow_summary', { year: 2026, month: 11 }, owner),
    );

    expect(summary).toEqual({
      collected: 700,
      partnerShare: 100,
      receivable: 2202,
      monthly: [{ month: '2026-11', collected: 700, partnerShare: 100 }],
    });
  });
});
