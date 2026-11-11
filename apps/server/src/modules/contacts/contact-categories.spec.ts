import { CONTACT_CATEGORY_KEYS } from '@estate-erp/shared';
import { contactCategoryWhere, deriveContactRoles } from './contact-categories';

describe('contactCategoryWhere', () => {
  const now = new Date('2026-11-04T16:00:00.000Z'); // 한국 시간 11월 5일 01:00

  it('defines a condition for every category key', () => {
    for (const key of CONTACT_CATEGORY_KEYS) {
      expect(contactCategoryWhere(key, now)).toEqual(expect.any(Object));
    }
  });

  it('uses the end of the Korean day for people to contact', () => {
    const where = contactCategoryWhere('follow_up', now) as {
      buyerIntakeContacts: {
        some: {
          buyerIntake: {
            requirements: { some: { nextContactDate: { lte: Date } } };
          };
        };
      };
    };

    expect(
      where.buyerIntakeContacts.some.buyerIntake.requirements.some
        .nextContactDate.lte.toISOString(),
    ).toBe('2026-11-05T14:59:59.999Z');
  });

  it('excludes closed work from role categories', () => {
    expect(contactCategoryWhere('buyer_sale', now)).toEqual({
      buyerIntakeContacts: {
        some: {
          buyerIntake: {
            lifecycleStatus: { in: ['open', 'hold'] },
            requirements: {
              some: { status: { in: ['active', 'hold'] }, transactionType: 'sale' },
            },
          },
        },
      },
    });
    expect(contactCategoryWhere('in_deal', now)).toEqual({
      OR: [
        {
          dealsAsBuyer: {
            some: {
              isCancelled: false,
              stage: { notIn: ['completed', 'closed'] },
            },
          },
        },
        {
          dealsAsSeller: {
            some: {
              isCancelled: false,
              stage: { notIn: ['completed', 'closed'] },
            },
          },
        },
      ],
    });
  });

  it('separates stale consultations from people never consulted', () => {
    const since = new Date('2026-10-05T16:00:00.000Z');

    expect(contactCategoryWhere('stale_consult', now)).toEqual({
      AND: [
        { consultations: { some: {} } },
        { consultations: { none: { createdAt: { gte: since } } } },
      ],
    });
    expect(contactCategoryWhere('no_consult', now)).toEqual({
      consultations: { none: {} },
    });
  });
});

describe('deriveContactRoles', () => {
  it('returns no roles for a contact with no relations', () => {
    expect(deriveContactRoles({})).toEqual([]);
  });

  it('derives every role from loaded relations', () => {
    expect(
      deriveContactRoles({
        buyerIntakeContacts: [
          {
            buyerIntake: {
              lifecycleStatus: 'open',
              requirements: [
                { transactionType: 'sale' },
                { transactionType: 'monthly' },
              ],
            },
          },
        ],
        propertyContacts: [{ role: 'co_owner' }, { role: 'lawyer' }],
        tenants: [{ id: 't1' }],
        dealsAsSeller: [{ id: 'd1' }],
      }),
    ).toEqual([
      'buyer_sale',
      'buyer_rent',
      'owner',
      'tenant',
      'representative',
      'in_deal',
    ]);
  });

  it('ignores requirements of closed intakes like the category filter does', () => {
    expect(
      deriveContactRoles({
        buyerIntakeContacts: [
          {
            buyerIntake: {
              lifecycleStatus: 'closed',
              requirements: [{ transactionType: 'sale' }],
            },
          },
        ],
      }),
    ).toEqual([]);
  });
});
