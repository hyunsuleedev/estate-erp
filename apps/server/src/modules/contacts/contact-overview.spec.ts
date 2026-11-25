import { readContactOverview, startOfKstDay, summarizeCommission } from './contact-overview';

describe('readContactOverview', () => {
  const place = (siteName: string, dong: string | null, unit: string) => ({
    site: { name: siteName },
    unit: { name: unit, floor: null, floorEnd: null, floorLabel: null, dong: dong ? { name: dong, isPlaceholder: false } : { name: '-', isPlaceholder: true } },
  });

  function createClient() {
    const client = {
      buyerIntakeContact: { findMany: jest.fn().mockResolvedValue([{ buyerIntakeId: 'bi-1' }]) },
      propertyContact: { findMany: jest.fn().mockResolvedValue([{ propertyId: 'p-owned' }]) },
      propertyLeaseTenant: { findMany: jest.fn().mockResolvedValue([]) },
      deal: { findMany: jest.fn().mockResolvedValue([]) },
      contract: { findMany: jest.fn().mockResolvedValue([]) },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return client;
  }

  it('scopes every query to the office and reads what this person did', async () => {
    const client = createClient();
    client.deal.findMany.mockResolvedValue([
      {
        id: 'deal-1',
        buyerContactId: 'c-1',
        transactionType: 'jeonse',
        stage: 'completed',
        isCancelled: false,
        agreedPrice: 85000,
        agreedDeposit: null,
        agreedMonthlyRent: null,
        stageChangedAt: new Date('2026-11-20'),
        listing: { propertyId: 'p-1', property: place('고덕그라시움', '102', '2203') },
        commissionPayments: [{ status: 'collected' }, { status: 'cancelled' }],
      },
    ]);
    client.contract.findMany.mockResolvedValue([
      {
        id: 'k-1',
        dealId: 'deal-2',
        buyerContactId: null,
        sellerContactId: null,
        transactionType: 'sale',
        status: 'signed',
        totalPrice: 158000,
        monthlyRent: null,
        contractDate: null,
        statedBalanceDate: null,
        parties: [{ side: 'one' }],
        deal: { listing: { property: place('고덕빌라', null, '201') } },
      },
    ]);
    client.calendarEvent.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        title: '임장',
        type: 'viewing',
        start: new Date('2026-11-29T05:00:00Z'),
        allDay: false,
        contactId: null,
        propertyId: null,
        property: null,
        listing: null,
        match: { buyerRequirement: { buyerIntakeId: 'other' }, listing: { propertyId: 'p-owned', property: place('고덕그라시움', '101', '3501') } },
      },
    ]);

    const overview = await readContactOverview(client as never, 'office-1', 'c-1', new Date('2026-11-22T10:00:00'));

    for (const delegate of [client.deal, client.contract, client.task, client.calendarEvent, client.match]) {
      expect(delegate.findMany.mock.calls[0][0].where).toMatchObject({ officeId: 'office-1' });
    }
    expect(overview.deals[0]).toMatchObject({
      role: 'buyer',
      place: '고덕그라시움 102동 2203호',
      commission: 'collected',
    });
    // 계약서 당사자 줄의 one 쪽은 매도(임대) 측이다. 동 구분 없는 건물은 동을 빼고 적는다
    expect(overview.contracts[0]).toMatchObject({ role: 'seller', place: '고덕빌라 201호' });
    // 이 사람이 소유한 집을 다른 손님이 보러 오는 임장
    expect(overview.events[0]).toMatchObject({ relation: 'owner', place: '고덕그라시움 101동 3501호' });
    // 열린 업무만, 이 사람에게 걸린 것만
    expect(client.task.findMany.mock.calls[0][0].where).toEqual({
      officeId: 'office-1',
      contactId: 'c-1',
      status: { in: ['pending', 'in_progress'] },
    });
    // 끝나거나 거래로 넘어간 매칭은 거래 쪽에서 보이므로 뺀다 (매수 + 소유 매물 모두)
    expect(client.match.findMany.mock.calls[0][0].where).toMatchObject({
      stage: { notIn: ['closed', 'dealCreated'] },
      OR: [
        { buyerRequirement: { buyerIntakeId: { in: ['bi-1'] } } },
        { listing: { propertyId: { in: ['p-owned'] } } },
      ],
    });
  });

  it('skips the match query for a person who is not a buyer', async () => {
    const client = createClient();
    client.buyerIntakeContact.findMany.mockResolvedValue([]);
    client.propertyContact.findMany.mockResolvedValue([]);

    const overview = await readContactOverview(client as never, 'office-1', 'c-1');

    expect(client.match.findMany).not.toHaveBeenCalled();
    expect(overview.matches).toEqual([]);
    // 일정은 이 사람에게 바로 걸린 것만 찾는다
    expect(client.calendarEvent.findMany.mock.calls[0][0].where.OR).toEqual([{ contactId: 'c-1' }]);
  });

  it('shows an agent only the commission status of deals assigned to them', async () => {
    const client = createClient();
    client.buyerIntakeContact.findMany.mockResolvedValue([]);
    client.propertyContact.findMany.mockResolvedValue([]);

    await readContactOverview(client as never, 'office-1', 'c-1', new Date(), { userId: 'u-agent', role: 'agent' });
    expect(client.deal.findMany.mock.calls[0][0].select.commissionPayments.where).toEqual({
      deal: { participants: { some: { userId: 'u-agent', sharePercent: { not: null } } } },
    });

    await readContactOverview(client as never, 'office-1', 'c-1', new Date(), { userId: 'u-owner', role: 'owner' });
    expect(client.deal.findMany.mock.calls[1][0].select.commissionPayments.where).toEqual({});
  });

  it('marks an upcoming viewing whose match was closed', async () => {
    const client = createClient();
    client.buyerIntakeContact.findMany.mockResolvedValue([{ buyerIntakeId: 'bi-1' }]);
    client.propertyContact.findMany.mockResolvedValue([]);
    client.calendarEvent.findMany.mockResolvedValue([
      {
        id: 'e-1',
        title: '임장',
        type: 'viewing',
        start: new Date('2026-11-26T05:00:00Z'),
        allDay: false,
        contactId: null,
        propertyId: null,
        property: null,
        listing: null,
        match: { stage: 'closed', buyerRequirement: { buyerIntakeId: 'bi-1' }, listing: null },
      },
    ]);

    const overview = await readContactOverview(client as never, 'office-1', 'c-1', new Date('2026-11-24T03:00:00Z'));
    expect(overview.events[0]).toMatchObject({ relation: 'buyer', matchClosed: true, viewingDone: false });
  });

  it('marks an upcoming viewing as done once the match moved past viewing or became a deal', async () => {
    const client = createClient();
    client.buyerIntakeContact.findMany.mockResolvedValue([{ buyerIntakeId: 'bi-1' }]);
    client.propertyContact.findMany.mockResolvedValue([]);
    const viewing = (id: string, match: Record<string, unknown>) => ({
      id,
      title: '임장',
      type: 'viewing',
      start: new Date('2026-11-26T05:00:00Z'),
      allDay: false,
      createdAt: new Date('2026-11-20T00:00:00Z'),
      contactId: null,
      propertyId: null,
      property: null,
      listing: null,
      match: { buyerRequirement: { buyerIntakeId: 'bi-1' }, listing: null, ...match },
    });
    client.calendarEvent.findMany.mockResolvedValue([
      // 고객 검토 중의 재임장, 진행 중인 거래의 임장(잔금 전 집 확인)은 유효한 약속이다
      viewing('e-review', { stage: 'buyerReviewing', deals: [] }),
      viewing('e-deal', { stage: 'dealCreated', deals: [{ id: 'd-1', stage: 'settling', createdAt: new Date('2026-11-22T00:00:00Z'), isCancelled: false }] }),
      // 임장을 잡아 둔 뒤(11.20) 거래로 넘어가(11.21) 정산 종료까지 끝났다
      viewing('e-ended', { stage: 'dealCreated', deals: [{ id: 'd-2', stage: 'closed', createdAt: new Date('2026-11-21T00:00:00Z'), isCancelled: false }] }),
      // 끝난 거래라도 거래를 만든 뒤에 잡은 약속(잔금 전 집 확인, 잔금 뒤 약속)은 그대로 둔다
      viewing('e-after', { stage: 'dealCreated', deals: [{ id: 'd-3', stage: 'closed', createdAt: new Date('2026-11-19T00:00:00Z'), isCancelled: false }] }),
      viewing('e-ahead', { stage: 'viewing', deals: [] }),
    ]);

    const overview = await readContactOverview(client as never, 'office-1', 'c-1', new Date('2026-11-24T03:00:00Z'));
    expect(overview.events.map((event) => [event.id, event.viewingDone])).toEqual([
      ['e-review', false],
      ['e-deal', false],
      ['e-ended', true],
      ['e-after', false],
      ['e-ahead', false],
    ]);
  });
});

describe('summarizeCommission', () => {
  it('says collected only when every live charge is collected, and nothing for drafts', () => {
    expect(summarizeCommission(['collected', 'waived'])).toBe('collected');
    expect(summarizeCommission(['collected', 'pending'])).toBe('collecting');
    expect(summarizeCommission(['draft'])).toBeNull();
    expect(summarizeCommission([])).toBeNull();
  });
});

describe('readContactOverview — 오늘의 경계는 한국 시간', () => {
  function client() {
    return {
      buyerIntakeContact: { findMany: jest.fn().mockResolvedValue([]) },
      propertyContact: { findMany: jest.fn().mockResolvedValue([]) },
      propertyLeaseTenant: { findMany: jest.fn().mockResolvedValue([]) },
      deal: { findMany: jest.fn().mockResolvedValue([]) },
      contract: { findMany: jest.fn().mockResolvedValue([]) },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  it.each([
    // 한국 11월 22일 08:59 = UTC 11월 21일 23:59 → 서버(UTC)의 날로 자르면 어제 일정이 섞인다
    ['KST 08:59', '2026-11-21T23:59:00.000Z'],
    // 한국 11월 22일 09:01 = UTC 11월 22일 00:01 → 서버의 날로 자르면 오늘의 종일 일정이 빠진다
    ['KST 09:01', '2026-11-22T00:01:00.000Z'],
  ])('%s에는 한국 11월 22일 0시(UTC 21일 15시)부터 읽는다', async (_label, nowIso) => {
    const c = client();
    await readContactOverview(c as never, 'office-1', 'c-1', new Date(nowIso));
    expect(c.calendarEvent.findMany.mock.calls[0][0].where.start).toEqual({
      gte: new Date('2026-11-21T15:00:00.000Z'),
    });
  });

  it('startOfKstDay는 한국 자정 직전과 직후를 다른 날로 나눈다', () => {
    expect(startOfKstDay(new Date('2026-11-21T14:59:00.000Z')).toISOString()).toBe('2026-11-20T15:00:00.000Z');
    expect(startOfKstDay(new Date('2026-11-21T15:00:00.000Z')).toISOString()).toBe('2026-11-21T15:00:00.000Z');
  });
});

