import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExternalListingGroup } from '@estate-erp/api-client';
import { sortExternalListingGroups } from '../src/renderer/routes/_authenticated/properties/-external-listing-sort';

function group(
  id: string,
  values: {
    site?: string;
    dong?: string;
    ho?: string;
    price?: number;
    priceMin?: number | null;
    priceMax?: number | null;
    direction?: string | null;
    area?: number | null;
    ownAdvertisementYmd?: string | null;
  },
): ExternalListingGroup {
  return {
    id,
    site: values.site ? ({ name: values.site } as never) : undefined,
    buildingName: values.dong ?? null,
    ho: values.ho ?? null,
    ownAdvertisementYmd: values.ownAdvertisementYmd ?? null,
    priceMin: values.priceMin ?? null,
    priceMax: values.priceMax ?? null,
    mainExternalListing: {
      price: values.price ?? null,
      direction: values.direction ?? null,
      exclusiveAreaM2: values.area ?? null,
    } as never,
  } as ExternalListingGroup;
}

describe('external listing table sorting', () => {
  const groups = [
    group('third', {
      site: '단지10',
      dong: '103동',
      ho: '1201',
      price: 230000,
      priceMin: 220000,
      priceMax: 240000,
      direction: 'SS',
      area: 120,
      ownAdvertisementYmd: null,
    }),
    group('first', {
      site: '단지2',
      dong: '101동',
      ho: '202',
      price: 180000,
      priceMin: 175000,
      priceMax: 190000,
      direction: 'ES',
      area: 59,
      ownAdvertisementYmd: '20260701',
    }),
    group('second', {
      site: '단지2',
      dong: '101동',
      ho: '1101',
      price: 210000,
      priceMin: 200000,
      priceMax: 225000,
      direction: 'WS',
      area: 84,
      ownAdvertisementYmd: '20260720',
    }),
  ];

  it('uses natural Korean ordering for separated site and unit fields', () => {
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'site', desc: false }],
        'sale',
      ).map((item) => item.id),
      ['first', 'second', 'third'],
    );
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'ho', desc: false }],
        'sale',
      ).map((item) => item.id),
      ['first', 'second', 'third'],
    );
  });

  it('sorts prices numerically and keeps missing own-ad dates last', () => {
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'price', desc: true }],
        'sale',
      ).map((item) => item.id),
      ['third', 'second', 'first'],
    );
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'priceMin', desc: false }],
        'sale',
      ).map((item) => item.id),
      ['first', 'second', 'third'],
    );
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'priceMax', desc: true }],
        'sale',
      ).map((item) => item.id),
      ['third', 'second', 'first'],
    );
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'myAd', desc: true }],
        'sale',
      ).map((item) => item.id),
      ['second', 'first', 'third'],
    );
  });

  it('sorts direction and area independently', () => {
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'direction', desc: false }],
        'sale',
      ).map((item) => item.id),
      ['first', 'third', 'second'],
    );
    assert.deepEqual(
      sortExternalListingGroups(
        groups,
        [{ id: 'area', desc: false }],
        'sale',
      ).map((item) => item.id),
      ['first', 'second', 'third'],
    );
  });
});
