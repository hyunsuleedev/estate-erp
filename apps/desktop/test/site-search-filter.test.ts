import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OfficeSite, Unit } from '@estate-erp/api-client';

import {
  filterOfficeSites,
  filterUnitsByRecordPresence,
  getSiteGroupKeys,
  prioritizeFavoriteOfficeSites,
} from '../src/renderer/routes/_authenticated/sites/-site-helpers';

const managedApartment = {
  id: 'office-site-1',
  officeId: 'office-1',
  siteId: 'site-1',
  memo: null,
  isFavorite: false,
  createdAt: '2026-07-28T00:00:00.000Z',
  site: {
    id: 'site-1',
    type: 'apartment',
    name: '고덕그라시움',
    roadAddress: '서울시 강동구 고덕동',
    jibunAddress: null,
    ward: {
      code: '1174010200',
      name: '고덕동',
      district: {
        code: '11740',
        name: '강동구',
        province: {
          code: '11',
          name: '서울시',
        },
      },
    },
  },
} as OfficeSite;

const managedVilla = {
  ...managedApartment,
  id: 'office-site-2',
  siteId: 'site-2',
  site: {
    ...managedApartment.site,
    id: 'site-2',
    type: 'villa',
    name: '문정동 빌라',
    roadAddress: '서울시 송파구 문정동',
    ward: {
      code: '1171010800',
      name: '문정동',
      district: {
        code: '11710',
        name: '송파구',
        province: {
          code: '11',
          name: '서울시',
        },
      },
    },
  },
} as OfficeSite;

describe('managed site search filter', () => {
  it('searches the visible site type as well as the name and address', () => {
    assert.deepEqual(filterOfficeSites([managedApartment], '아파트'), [managedApartment]);
    assert.deepEqual(filterOfficeSites([managedApartment], '서울시'), [managedApartment]);
  });

  it('matches whitespace-separated tokens without requiring exact spacing', () => {
    assert.deepEqual(filterOfficeSites([managedApartment], '고덕 그라시움'), [managedApartment]);
    assert.deepEqual(filterOfficeSites([managedApartment], '강동 고덕'), [managedApartment]);
  });

  it('combines region and site-type facets with text search', () => {
    const sites = [managedApartment, managedVilla];

    assert.deepEqual(
      filterOfficeSites(sites, '', { regions: ['강동구 고덕동'] }),
      [managedApartment],
    );
    assert.deepEqual(
      filterOfficeSites(sites, '', { types: ['villa'] }),
      [managedVilla],
    );
    assert.deepEqual(
      filterOfficeSites(sites, '서울', {
        regions: ['송파구 문정동'],
        types: ['villa'],
      }),
      [managedVilla],
    );
  });

  it('computes the target group keys before the grouping mode changes', () => {
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'type'), ['아파트']);
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'region'), ['강동구 고덕동']);
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'none'), []);
  });

  it('prioritizes favorites without changing the order of either section', () => {
    const newestRegular = {
      ...managedApartment,
      id: 'office-site-2',
      siteId: 'site-2',
    };
    const favorite = {
      ...managedApartment,
      id: 'office-site-3',
      siteId: 'site-3',
      isFavorite: true,
    };

    assert.deepEqual(
      prioritizeFavoriteOfficeSites([newestRegular, favorite, managedApartment]),
      [favorite, newestRegular, managedApartment],
    );
  });
});

describe('managed unit record filters', () => {
  const emptyUnit = {
    id: 'empty-unit',
    properties: [],
  } as unknown as Unit;
  const ownerOnlyUnit = {
    id: 'owner-only-unit',
    properties: [
      {
        propertyContacts: [{ role: 'owner' }],
        tenants: [],
        listings: [],
        consultations: [],
      },
    ],
  } as unknown as Unit;
  const fullyRecordedUnit = {
    id: 'fully-recorded-unit',
    properties: [
      {
        propertyContacts: [{ role: 'owner' }],
        tenants: [{}],
        listings: [{}],
        consultations: [{}],
      },
    ],
  } as unknown as Unit;
  const units = [emptyUnit, ownerOnlyUnit, fullyRecordedUnit];

  it('combines owner, tenant, listing, and consultation presence', () => {
    assert.deepEqual(
      filterUnitsByRecordPresence(units, {
        owner: 'present',
        tenant: 'missing',
        listing: 'missing',
        consultation: 'missing',
      }),
      [ownerOnlyUnit],
    );
    assert.deepEqual(
      filterUnitsByRecordPresence(units, {
        owner: 'missing',
        tenant: 'missing',
        listing: 'missing',
        consultation: 'missing',
      }),
      [emptyUnit],
    );
    assert.deepEqual(
      filterUnitsByRecordPresence(units, {
        owner: 'present',
        tenant: 'present',
        listing: 'present',
        consultation: 'present',
      }),
      [fullyRecordedUnit],
    );
  });
});
