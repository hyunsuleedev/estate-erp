import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OfficeSite } from '@estate-erp/api-client';

import {
  filterOfficeSites,
  getSiteGroupKeys,
} from '../src/renderer/routes/_authenticated/sites/-site-helpers';

const managedApartment = {
  id: 'office-site-1',
  officeId: 'office-1',
  siteId: 'site-1',
  memo: null,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
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

describe('managed site search filter', () => {
  it('searches the visible site type as well as the name and address', () => {
    assert.deepEqual(filterOfficeSites([managedApartment], '아파트'), [managedApartment]);
    assert.deepEqual(filterOfficeSites([managedApartment], '서울시'), [managedApartment]);
  });

  it('matches whitespace-separated tokens without requiring exact spacing', () => {
    assert.deepEqual(filterOfficeSites([managedApartment], '고덕 그라시움'), [managedApartment]);
    assert.deepEqual(filterOfficeSites([managedApartment], '강동 고덕'), [managedApartment]);
  });

  it('computes the target group keys before the grouping mode changes', () => {
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'type'), ['아파트']);
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'region'), ['강동구 고덕동']);
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'none'), []);
  });
});
