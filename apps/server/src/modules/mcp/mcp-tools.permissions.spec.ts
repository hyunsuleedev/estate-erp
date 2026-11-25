import { EmployeesService } from '../employees/employees.service';
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
      // 가리는 규칙은 실제 구현을 쓴다
      forViewer: EmployeesService.prototype.forViewer,
    };
    const commissionPayments = {
      listByOffice: jest.fn().mockResolvedValue([]),
      listByDeal: jest.fn().mockResolvedValue([]),
    };
    const cashflow = {
      getSummary: jest.fn().mockResolvedValue({
        collected: 700,
        partnerShare: 100,
        monthlyExpense: 418,
        netProfit: 182,
        receivable: 2202,
        monthly: [{ month: '2026-11', collected: 700, partnerShare: 100, expense: 418, net: 182 }],
      }),
    };
    const deals = {
      create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'deal-1' }),
    };
    const noop = {};

    const service = new (McpToolsService as any)(
      noop, // listings
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
      noop, // listingIntakes
      noop, // listingAdvertisementSnapshots
    ) as McpToolsService;

    return { service, employees, commissionPayments, cashflow, deals };
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

    await service.executeTool('create_deal', { listingId: 'listing-1' }, agent);

    expect(deals.create).toHaveBeenCalledWith('office-1', expect.anything(), {
      userId: 'agent-1',
      role: 'agent',
    });
  });

  it('거래 조회에 보는 사람을 넘긴다 (담당 아닌 거래의 수수료를 싣지 않게)', async () => {
    const { service, deals } = createService();

    await service.executeTool('find_deals', {}, agent);
    expect(deals.findAll).toHaveBeenCalledWith('office-1', false, {
      userId: 'agent-1',
      role: 'agent',
    });

    await service.executeTool('get_deal', { id: 'deal-1' }, agent);
    expect(deals.findOne).toHaveBeenCalledWith('deal-1', 'office-1', {
      userId: 'agent-1',
      role: 'agent',
    });
  });

  it('캐시플로우 요약에 고정비와 순이익을 싣지 않는다 (화면에서 내린 것과 같게)', async () => {
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
