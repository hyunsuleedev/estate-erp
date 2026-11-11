import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getPriceChange,
  type PriceChangeTerms,
} from '../src/renderer/routes/_authenticated/properties/-external-listing-price';

const since = '2026-11-02T00:00:00.000Z';

function listing(overrides: Partial<PriceChangeTerms>): PriceChangeTerms {
  return {
    price: null,
    deposit: null,
    monthlyRent: null,
    previousPrice: null,
    previousDeposit: null,
    previousMonthlyRent: null,
    priceChangedAt: '2026-11-03T01:00:00.000Z',
    firstSeenAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getPriceChange', () => {
  it('reports the sale price change since the last completed snapshot', () => {
    assert.deepEqual(
      getPriceChange(
        listing({ price: 210000, previousPrice: 213000 }),
        'sale',
        since,
      ),
      { mainAmount: -3000, rentAmount: null },
    );
  });

  it('ignores a change from before the comparison baseline', () => {
    assert.equal(
      getPriceChange(
        listing({
          price: 210000,
          previousPrice: 213000,
          priceChangedAt: '2026-11-01T23:59:59.000Z',
        }),
        'sale',
        since,
      ),
      null,
    );
  });

  it('counts a change exactly at the baseline like the close result', () => {
    assert.ok(
      getPriceChange(
        listing({ price: 210000, previousPrice: 213000, priceChangedAt: since }),
        'sale',
        since,
      ),
    );
  });

  it('leaves a listing first seen in this comparison to the new and added status', () => {
    assert.equal(
      getPriceChange(
        listing({
          price: 210000,
          previousPrice: 213000,
          firstSeenAt: '2026-11-03T00:30:00.000Z',
        }),
        'sale',
        since,
      ),
      null,
    );
  });

  it('needs a comparison baseline and a change time', () => {
    const changed = listing({ price: 210000, previousPrice: 213000 });
    assert.equal(getPriceChange(changed, 'sale', null), null);
    assert.equal(
      getPriceChange({ ...changed, priceChangedAt: null }, 'sale', since),
      null,
    );
  });

  it('uses the deposit for jeonse', () => {
    assert.deepEqual(
      getPriceChange(
        listing({ deposit: 54000, previousDeposit: 52000 }),
        'jeonse',
        since,
      ),
      { mainAmount: 2000, rentAmount: null },
    );
  });

  it('reports both the monthly deposit and the rent', () => {
    assert.deepEqual(
      getPriceChange(
        listing({
          deposit: 50000,
          previousDeposit: 52000,
          monthlyRent: 160,
          previousMonthlyRent: 150,
        }),
        'monthly',
        since,
      ),
      { mainAmount: -2000, rentAmount: 10 },
    );
  });

  it('reports the rent alone when the monthly deposit stayed the same', () => {
    assert.deepEqual(
      getPriceChange(
        listing({
          deposit: 50000,
          previousDeposit: 50000,
          monthlyRent: 140,
          previousMonthlyRent: 150,
        }),
        'monthly',
        since,
      ),
      { mainAmount: null, rentAmount: -10 },
    );
  });

  it('treats a price that first appeared as no change', () => {
    assert.equal(
      getPriceChange(
        listing({ price: 210000, previousPrice: null }),
        'sale',
        since,
      ),
      null,
    );
  });
});
