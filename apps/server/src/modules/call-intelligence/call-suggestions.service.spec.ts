import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CallSuggestionsService } from './call-suggestions.service';

const LISTING = '10000000-0000-4000-8000-000000000003';
const INTAKE = '10000000-0000-4000-8000-000000000002';
const REQUIREMENT = '10000000-0000-4000-8000-000000000006';
const SITE_OLD = '10000000-0000-4000-8000-000000000008';
const SITE_NEW = '10000000-0000-4000-8000-000000000009';
const calledAt = new Date('2026-11-02T05:30:00.000Z');

function setup(suggestion: Record<string, unknown>) {
  const prisma = {
    callActionSuggestion: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'suggestion-1',
        status: 'pending',
        consultationId: 'consultation-1',
        contactId: 'contact-1',
        recording: { id: 'recording-1', contactId: 'contact-1', userId: 'agent-1', calledAt },
        ...suggestion,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'suggestion-1', ...data })),
    },
    listing: { count: jest.fn().mockResolvedValue(1) },
    property: { count: jest.fn().mockResolvedValue(1) },
    buyerRequirement: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue({
        memo: '기존 메모',
        preferredSites: [{ siteId: SITE_OLD, priority: 1, memo: null }],
      }),
    },
    match: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    task: { findFirst: jest.fn().mockResolvedValue(null) },
    calendarEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    consultation: { findFirst: jest.fn().mockResolvedValue(null) },
    listingIntake: { count: jest.fn().mockResolvedValue(1) },
    buyerIntake: { count: jest.fn().mockResolvedValue(1) },
    site: { count: jest.fn().mockResolvedValue(1) },
    $transaction: jest.fn(),
  };
  // 트랜잭션 안에서도 같은 모의 객체를 쓴다
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const tasks = { create: jest.fn().mockResolvedValue({ id: 'task-1' }) };
  const calendarEvents = { create: jest.fn().mockResolvedValue({ id: 'event-1' }) };
  const buyerRequirements = {
    create: jest.fn().mockResolvedValue({ id: 'requirement-new' }),
    update: jest.fn().mockResolvedValue({ id: REQUIREMENT }),
  };
  const matches = { create: jest.fn().mockResolvedValue({ id: 'match-1' }), updateStage: jest.fn() };
  const listingIntakes = { confirm: jest.fn().mockResolvedValue({}) };
  const listings = { update: jest.fn().mockResolvedValue({}) };
  const service = new CallSuggestionsService(
    prisma as never,
    tasks as never,
    calendarEvents as never,
    buyerRequirements as never,
    matches as never,
    listingIntakes as never,
    listings as never,
  );
  return { prisma, tasks, calendarEvents, buyerRequirements, matches, listingIntakes, listings, service };
}

describe('CallSuggestionsService', () => {
  it('creates an AI task assigned to the agent who took the call and links it to the call consultation', async () => {
    const { service, tasks, prisma } = setup({
      type: 'task',
      payload: { title: '김OO님께 등기부 보내기', dueDate: '2026-11-03', priority: 'high', listingId: LISTING },
    });

    const result = await service.accept('suggestion-1', 'office-1', 'owner-1');

    expect(tasks.create).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        title: '김OO님께 등기부 보내기',
        source: 'ai',
        priority: 'high',
        dueDate: '2026-11-03',
        assignedToId: 'agent-1',
        contactId: 'contact-1',
        consultationId: 'consultation-1',
        listingId: LISTING,
      }),
      'owner-1',
      // 제안 id를 새 할 일의 id로 써서 다시 반영해도 한 건만 생긴다
      { id: 'suggestion-1' },
    );
    expect(result).toMatchObject({ status: 'accepted', appliedEntityType: 'task', appliedEntityId: 'task-1' });
    // 처음 상태가 pending(또는 오래 멈춘 applying)일 때만 처리를 잡는다
    expect(prisma.callActionSuggestion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'suggestion-1', officeId: 'office-1' }),
        data: { status: 'applying' },
      }),
    );
  });

  it('applies the edited payload and records it', async () => {
    const { service, calendarEvents } = setup({
      type: 'calendar_event',
      payload: { title: '임장', start: '2026-11-04T15:00:00+09:00', eventType: 'viewing' },
    });

    const result = await service.accept('suggestion-1', 'office-1', 'owner-1', {
      title: '임장 (시간 변경)',
      start: '2026-11-04T16:30',
      eventType: 'viewing',
    });

    expect(calendarEvents.create).toHaveBeenCalledWith(
      'office-1',
      'agent-1',
      expect.objectContaining({ title: '임장 (시간 변경)', start: '2026-11-04T16:30:00+09:00', type: 'viewing' }),
      { id: 'suggestion-1' },
    );
    expect(result).toMatchObject({ appliedPayload: expect.objectContaining({ title: '임장 (시간 변경)' }) });
  });

  it('refuses when someone else is already handling the suggestion', async () => {
    const { service, prisma, tasks } = setup({ type: 'task', payload: { title: 'x' } });
    prisma.callActionSuggestion.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('puts the suggestion back to pending when applying fails', async () => {
    const { service, prisma, matches } = setup({
      type: 'match_stage',
      payload: { matchId: '10000000-0000-4000-8000-000000000007', stage: 'buyerInterested' },
    });
    prisma.match.findFirst.mockResolvedValue({ stage: 'suggested' });
    matches.updateStage.mockRejectedValue(new BadRequestException('매물 확인을 완료한 뒤 고객 관심 단계로 이동할 수 있습니다'));

    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toThrow('매물 확인을 완료한 뒤');
    expect(prisma.callActionSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'suggestion-1' },
      data: { status: 'pending' },
    });
  });

  it('rejects an edited payload that points to another office', async () => {
    const { service, prisma, tasks } = setup({ type: 'task', payload: { title: 'x' } });
    prisma.listing.count.mockResolvedValue(0);

    await expect(
      service.accept('suggestion-1', 'office-1', 'owner-1', { title: 'x', listingId: LISTING }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('updates the request and marks the suggestion accepted in one transaction (memo appended once)', async () => {
    const { service, prisma, buyerRequirements } = setup({
      type: 'buyer_requirement_update',
      payload: {
        buyerReqId: REQUIREMENT,
        changes: { priceMax: 130000, siteIds: [SITE_OLD, SITE_NEW], moveInDate: '2027-03-01' },
        memoAppend: '남향 선호\n저층 제외',
      },
    });
    prisma.site.count.mockResolvedValue(2);
    const requirementUpdate = jest.fn().mockResolvedValue({});
    Object.assign(prisma.buyerRequirement, { update: requirementUpdate });

    await service.accept('suggestion-1', 'office-1', 'owner-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(requirementUpdate).toHaveBeenCalledWith({
      where: { id: REQUIREMENT },
      data: {
        priceMax: 130000,
        moveInDate: new Date('2027-03-01'),
        memo: '기존 메모\n남향 선호\n저층 제외',
        preferredSites: {
          deleteMany: {},
          create: [
            { siteId: SITE_OLD, priority: 1, memo: null },
            { siteId: SITE_NEW, priority: 2 },
          ],
        },
        lastContactDate: calledAt,
      },
    });
    // 같은 트랜잭션 안에서 "반영함"을 저장한다 → 저장이 실패하면 메모 덧붙임도 함께 취소된다
    const txOrder = prisma.$transaction.mock.invocationCallOrder[0];
    const acceptedCall = prisma.callActionSuggestion.update.mock.calls.findIndex(
      ([args]: [{ data: { status?: string } }]) => args.data.status === 'accepted',
    );
    expect(acceptedCall).toBeGreaterThanOrEqual(0);
    expect(prisma.callActionSuggestion.update.mock.invocationCallOrder[acceptedCall]).toBeGreaterThan(txOrder);
    expect(buyerRequirements.update).not.toHaveBeenCalled();
  });

  it('updates prices, then confirms the intake as a phone check linked to the call', async () => {
    const { service, listings, listingIntakes } = setup({
      type: 'listing_confirm',
      payload: {
        intakeId: INTAKE,
        result: 'price_changed',
        priceChanges: [{ listingId: LISTING, price: 155000 }],
        memo: '집주인 인하 동의',
      },
    });

    await service.accept('suggestion-1', 'office-1', 'owner-1');

    expect(listings.update).toHaveBeenCalledWith(LISTING, 'office-1', { price: 155000 });
    expect(listingIntakes.confirm).toHaveBeenCalledWith(INTAKE, 'office-1', 'owner-1', {
      result: 'price_changed',
      channel: 'phone',
      memo: '집주인 인하 동의',
      contactId: 'contact-1',
      checkedAt: calledAt,
      callRecordingId: 'recording-1',
    });
  });

  it('needs a linked contact to add a buyer request', async () => {
    const { service, buyerRequirements, prisma } = setup({
      type: 'buyer_requirement_create',
      payload: { transactionType: 'sale', priceMax: 120000 },
      // 모르는 번호로 분석한 제안 (분석 때도 지금도 연락처 없음)
      contactId: null,
      appliedPayload: null,
      recording: { id: 'recording-1', contactId: null, userId: 'agent-1', calledAt },
    });

    prisma.buyerRequirement.findFirst.mockResolvedValue(null);
    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toThrow(
      '통화 상대 연락처를 먼저 연결해 주세요',
    );
    expect(buyerRequirements.create).not.toHaveBeenCalled();
  });

  it('does not accept a dismissed suggestion until it is restored', async () => {
    const { service } = setup({ type: 'task', status: 'dismissed', payload: { title: 'x' } });
    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toThrow('되돌린 뒤 반영해 주세요');
  });

  it('does not create a second task when saving the accepted state failed and the broker retries', async () => {
    const { service, prisma, tasks } = setup({ type: 'task', payload: { title: '등기부 보내기' } });
    // 1차: 내용 기록 → 할 일 생성 → "반영함" 저장 실패 → 다시 처리 대기
    prisma.callActionSuggestion.update
      .mockImplementationOnce(async ({ data }) => data)
      .mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toThrow('connection lost');
    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(prisma.callActionSuggestion.update).toHaveBeenLastCalledWith({
      where: { id: 'suggestion-1' },
      data: { status: 'pending' },
    });
    const recorded = prisma.callActionSuggestion.update.mock.calls[0][0].data.appliedPayload;

    // 2차: 제안 id로 만든 할 일이 있으므로 새로 만들지 않고 실제 적용된 내용으로 마무리한다
    prisma.callActionSuggestion.findFirst.mockResolvedValue({
      id: 'suggestion-1',
      status: 'pending',
      type: 'task',
      contactId: 'contact-1',
      consultationId: 'consultation-1',
      payload: { title: '등기부 보내기' },
      appliedPayload: recorded,
      recording: { id: 'recording-1', contactId: 'contact-1', userId: 'agent-1', calledAt },
    });
    prisma.task.findFirst.mockResolvedValue({ id: 'suggestion-1' });
    const result = await service.accept('suggestion-1', 'office-1', 'owner-1');

    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'accepted', appliedEntityType: 'task', appliedEntityId: 'suggestion-1' });
  });

  it('does not pretend an edited retry was applied when the first attempt already created the event', async () => {
    const at15 = { title: '임장', start: '2026-11-04T15:00:00+09:00', eventType: 'viewing' };
    const { service, prisma, calendarEvents } = setup({ type: 'calendar_event', payload: at15 });
    // 1차: 15시로 일정 생성, "반영함" 저장만 실패
    prisma.callActionSuggestion.update
      .mockImplementationOnce(async ({ data }) => data)
      .mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toThrow('connection lost');
    const applied15 = prisma.callActionSuggestion.update.mock.calls[0][0].data.appliedPayload;

    // 2차: 16시로 고쳐서 다시 반영
    prisma.callActionSuggestion.findFirst.mockResolvedValue({
      id: 'suggestion-1',
      status: 'pending',
      type: 'calendar_event',
      contactId: 'contact-1',
      consultationId: 'consultation-1',
      payload: at15,
      appliedPayload: applied15,
      recording: { id: 'recording-1', contactId: 'contact-1', userId: 'agent-1', calledAt },
    });
    prisma.calendarEvent.findFirst.mockResolvedValue({ id: 'suggestion-1' });
    prisma.callActionSuggestion.update.mockClear();

    await expect(
      service.accept('suggestion-1', 'office-1', 'owner-1', { ...at15, start: '2026-11-04T16:00' }),
    ).rejects.toThrow('앞서 반영한 내용으로 이미 처리돼 있어요');

    expect(calendarEvents.create).toHaveBeenCalledTimes(1);
    // 실제로 만들어진 15시 내용으로 마무리한다 (16시로 기록하지 않는다)
    expect(prisma.callActionSuggestion.update).toHaveBeenCalledTimes(1);
    expect(prisma.callActionSuggestion.update.mock.calls[0][0].data).toMatchObject({
      status: 'accepted',
      appliedPayload: expect.objectContaining({ start: '2026-11-04T15:00:00+09:00' }),
    });
  });

  it('treats a concurrent duplicate insert of the same suggestion as already applied', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const { service, prisma, calendarEvents } = setup({
      type: 'calendar_event',
      payload: { title: '임장', start: '2026-11-04T15:00:00+09:00', eventType: 'viewing' },
    });
    calendarEvents.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    prisma.calendarEvent.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'suggestion-1' });

    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).resolves.toMatchObject({
      status: 'accepted',
      appliedEntityId: 'suggestion-1',
    });
  });

  it('refuses suggestions analyzed for a different caller after the call contact changed', async () => {
    const { service, tasks, listingIntakes, prisma } = setup({
      type: 'listing_confirm',
      contactId: 'contact-A',
      payload: { intakeId: INTAKE, result: 'unavailable', priceChanges: [], memo: null },
      recording: { id: 'recording-1', contactId: 'contact-B', userId: 'agent-1', calledAt },
    });

    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toThrow(
      '통화 상대가 바뀌어 이 제안은 반영할 수 없습니다',
    );
    expect(listingIntakes.confirm).not.toHaveBeenCalled();
    expect(tasks.create).not.toHaveBeenCalled();
    expect(prisma.callActionSuggestion.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an edited payload that points to another customer's request", async () => {
    const { service, prisma, buyerRequirements } = setup({
      type: 'buyer_requirement_update',
      payload: { buyerReqId: REQUIREMENT, changes: { priceMax: 130000 }, memoAppend: null },
    });
    // 사무소 안의 요청이지만 통화 상대가 참여한 구매 의뢰의 요청이 아니다
    prisma.buyerRequirement.count.mockImplementation(async ({ where }) => (where.buyerIntake ? 0 : 1));

    await expect(service.accept('suggestion-1', 'office-1', 'owner-1')).rejects.toThrow(
      '통화 상대의 고객 요청이(가) 아닙니다',
    );
    expect(buyerRequirements.update).not.toHaveBeenCalled();
  });

  it('finishes without writing again when a stage move or intake confirmation already took effect', async () => {
    const stagePayload = { matchId: '10000000-0000-4000-8000-000000000007', stage: 'viewingConfirmed' };
    const stage = setup({ type: 'match_stage', payload: stagePayload, appliedPayload: stagePayload });
    stage.prisma.match.findFirst.mockResolvedValue({ stage: 'viewingConfirmed' });
    await expect(stage.service.accept('suggestion-1', 'office-1', 'owner-1')).resolves.toMatchObject({
      status: 'accepted',
    });
    expect(stage.matches.updateStage).not.toHaveBeenCalled();

    const confirmPayload = { intakeId: INTAKE, result: 'alive', priceChanges: [], memo: null };
    const confirm = setup({ type: 'listing_confirm', payload: confirmPayload, appliedPayload: confirmPayload });
    confirm.prisma.consultation.findFirst.mockResolvedValue({ id: 'confirm-consultation' });
    await confirm.service.accept('suggestion-1', 'office-1', 'owner-1');
    expect(confirm.listingIntakes.confirm).not.toHaveBeenCalled();
    expect(confirm.listings.update).not.toHaveBeenCalled();
  });

  it('uses the state read after claiming when another request applied it meanwhile', async () => {
    const at15 = { title: '임장', start: '2026-11-04T15:00:00+09:00', eventType: 'viewing' };
    const { service, prisma, calendarEvents } = setup({ type: 'calendar_event', payload: at15 });

    // 메모리 안의 제안 행과 일정 표
    const row: Record<string, unknown> = {
      id: 'suggestion-1',
      status: 'pending',
      type: 'calendar_event',
      contactId: 'contact-1',
      consultationId: 'consultation-1',
      payload: at15,
      appliedPayload: null,
      updatedAt: new Date(),
      recording: { id: 'recording-1', contactId: 'contact-1', userId: 'agent-1', calledAt },
    };
    const events = new Map<string, unknown>();
    let failAcceptedSave = true;
    let releaseSecondClaim!: () => void;
    const secondClaimGate = new Promise<void>((resolve) => (releaseSecondClaim = resolve));
    let claimCalls = 0;

    prisma.callActionSuggestion.findFirst.mockImplementation(async () => JSON.parse(JSON.stringify(row)));
    prisma.callActionSuggestion.updateMany.mockImplementation(async ({ data }) => {
      claimCalls += 1;
      if (claimCalls === 2) await secondClaimGate; // B는 A가 끝난 뒤에 처리 권한을 시도한다
      if (row.status !== 'pending') return { count: 0 };
      Object.assign(row, data, { updatedAt: new Date() });
      return { count: 1 };
    });
    prisma.callActionSuggestion.update.mockImplementation(async ({ data }) => {
      if (data.status === 'accepted' && failAcceptedSave) {
        failAcceptedSave = false;
        throw new Error('connection lost');
      }
      Object.assign(row, data);
      return { ...row };
    });
    calendarEvents.create.mockImplementation(async (_officeId, _userId, dto, options) => {
      events.set(options.id, dto);
      return { id: options.id };
    });
    prisma.calendarEvent.findFirst.mockImplementation(async ({ where }) =>
      events.has(where.id) ? { id: where.id } : null,
    );

    // A(그대로 반영)와 B(16시로 고쳐 반영)가 둘 다 pending을 읽은 뒤 진행한다
    const a = service.accept('suggestion-1', 'office-1', 'owner-1');
    const b = service.accept('suggestion-1', 'office-1', 'owner-2', { ...at15, start: '2026-11-04T16:00' });
    await expect(a).rejects.toThrow('connection lost');
    releaseSecondClaim();
    await expect(b).rejects.toThrow('앞서 반영한 내용으로 이미 처리돼 있어요');

    // 실제 일정은 15시 하나, 반영 기록도 15시
    expect(calendarEvents.create).toHaveBeenCalledTimes(1);
    expect(events.get('suggestion-1')).toMatchObject({ start: '2026-11-04T15:00:00+09:00' });
    expect(row).toMatchObject({
      status: 'accepted',
      appliedPayload: expect.objectContaining({ start: '2026-11-04T15:00:00+09:00' }),
    });
  });
});

