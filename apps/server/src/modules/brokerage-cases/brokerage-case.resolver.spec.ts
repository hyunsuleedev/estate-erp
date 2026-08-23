import {
  listingCaseParticipants,
  mergeBuyerIntakeCaseParticipants,
  resolveBrokerageCaseForIntake,
} from './brokerage-case.resolver';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const BUYER_ID = '00000000-0000-4000-8000-000000000002';
const CO_BUYER_ID = '00000000-0000-4000-8000-000000000003';
const REPRESENTATIVE_ID = '00000000-0000-4000-8000-000000000004';

function createTransaction() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    brokerageCase: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'case-new' }),
      update: jest.fn().mockResolvedValue({}),
    },
    brokerageCaseParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    propertyContact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    buyerIntake: {
      findFirst: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({
        _max: { casePriorityRank: null },
      }),
    },
    listingIntake: {
      aggregate: jest.fn().mockResolvedValue({
        _max: { casePriorityRank: null },
      }),
    },
  };
}

describe('resolveBrokerageCaseForIntake', () => {
  it('creates an isolated listing case when the property has no contacts', async () => {
    const tx = createTransaction();

    const participants = await listingCaseParticipants(
      tx as never,
      OFFICE_ID,
      'property-without-contacts',
    );
    const result = await resolveBrokerageCaseForIntake(tx as never, {
      officeId: OFFICE_ID,
      intakeKind: 'listing',
      participants,
    });

    expect(participants).toEqual([]);
    expect(result).toEqual({
      brokerageCaseId: 'case-new',
      casePriorityRank: 1,
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.brokerageCase.findMany).not.toHaveBeenCalled();
    expect(tx.brokerageCaseParticipant.create).not.toHaveBeenCalled();
  });

  it('still rejects a buyer intake without any contacts', async () => {
    const tx = createTransaction();

    await expect(
      resolveBrokerageCaseForIntake(tx as never, {
        officeId: OFFICE_ID,
        intakeKind: 'buyer',
        participants: [],
      }),
    ).rejects.toThrow('중개 케이스에는 연락처가 한 명 이상 필요합니다.');

    expect(tx.brokerageCase.create).not.toHaveBeenCalled();
  });

  it('attaches to an active case only when the principal set matches exactly', async () => {
    const tx = createTransaction();
    tx.brokerageCase.findMany.mockResolvedValue([
      {
        id: 'case-existing',
        participants: [
          { contactId: CO_BUYER_ID },
          { contactId: BUYER_ID },
        ],
      },
    ]);
    tx.buyerIntake.aggregate.mockResolvedValue({
      _max: { casePriorityRank: 2 },
    });

    const result = await resolveBrokerageCaseForIntake(tx as never, {
      officeId: OFFICE_ID,
      intakeKind: 'buyer',
      participants: [
        { contactId: BUYER_ID, role: 'buyer', isPrincipal: true },
        { contactId: CO_BUYER_ID, role: 'co_buyer', isPrincipal: true },
        {
          contactId: REPRESENTATIVE_ID,
          role: 'representative',
          isPrincipal: false,
        },
      ],
    });

    expect(result).toEqual({
      brokerageCaseId: 'case-existing',
      casePriorityRank: 3,
    });
    expect(tx.brokerageCase.create).not.toHaveBeenCalled();
  });

  it('does not merge cases that merely share one principal', async () => {
    const tx = createTransaction();
    tx.brokerageCase.findMany.mockResolvedValue([
      {
        id: 'case-overlap',
        participants: [{ contactId: BUYER_ID }],
      },
    ]);

    const result = await resolveBrokerageCaseForIntake(tx as never, {
      officeId: OFFICE_ID,
      intakeKind: 'buyer',
      participants: [
        { contactId: BUYER_ID, role: 'buyer', isPrincipal: true },
        { contactId: CO_BUYER_ID, role: 'co_buyer', isPrincipal: true },
      ],
    });

    expect(result.brokerageCaseId).toBe('case-new');
    expect(tx.brokerageCase.create).toHaveBeenCalledWith({
      data: { officeId: OFFICE_ID },
      select: { id: true },
    });
  });

  it('merges a later-added representative into the existing case address book', async () => {
    const tx = createTransaction();
    tx.buyerIntake.findFirst.mockResolvedValue({
      brokerageCaseId: 'case-existing',
      contacts: [
        {
          contactId: BUYER_ID,
          role: 'buyer',
          isPrimary: true,
        },
        {
          contactId: REPRESENTATIVE_ID,
          role: 'representative',
          isPrimary: false,
        },
      ],
    });

    await mergeBuyerIntakeCaseParticipants(
      tx as never,
      OFFICE_ID,
      'intake-existing',
    );

    expect(tx.brokerageCaseParticipant.create).toHaveBeenCalledWith({
      data: {
        officeId: OFFICE_ID,
        brokerageCaseId: 'case-existing',
        contactId: REPRESENTATIVE_ID,
        roles: ['representative'],
        isPrincipal: false,
        isCommunicationPrimary: false,
      },
    });
  });
});
