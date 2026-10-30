import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHomes, initialFilters, mapPoints, queryString, area } from '../src/model';
import { demoHomes } from '../src/demo';
test('monthly price filters use deposit and preserve inclusive boundaries', () => {
  const homes = filterHomes(demoHomes, { ...initialFilters, transactionType: 'monthly', priceMin: '5000', priceMax: '5000' });
  assert.equal(homes.length, 1);
  assert.equal(homes[0].listing.deposit, 5000);
});
test('map bounds exclude homes outside viewport', () => {
  const homes = filterHomes(demoHomes, { ...initialFilters, bounds: { south: 37.559, north: 37.561, west: 127.154, east: 127.156 } });
  assert.equal(homes.length, 2);
  const points = mapPoints(homes);
  assert.equal(points.length, 1);
  assert.equal(points[0].transactionType, 'mixed');
  assert.equal(points[0].minPrice, null);
  assert.equal(points[0].count, 2);
});
test('search and type filters compose', () => {
  const homes = filterHomes(demoHomes, { ...initialFilters, search: '고덕', transactionType: 'sale' });
  assert.equal(homes.length, 1);
  assert.equal(filterHomes(demoHomes, { ...initialFilters, search: '없는단지' }).length, 0);
});
test('area falls back to catalogue only when unit area is absent', () => {
  const home = structuredClone(demoHomes[0]);
  home.listing.property.unit = { exclusiveAreaM2: null, floor: 1, siteUnitType: { exclusiveAreaM2: '84.9' } };
  assert.equal(area(home), 84.9);
  assert.equal(filterHomes([home], { ...initialFilters, areaMin: '85' }).length, 0);
});
test('query preserves zero bounds and price', () => {
  const params = new URLSearchParams(queryString({ ...initialFilters, priceMin: '0', bounds: { south: 0, north: 1, west: 0, east: 1 } }));
  assert.equal(params.get('south'), '0');
  assert.equal(params.get('priceMin'), '0');
  assert.equal(params.has('bounds'), false);
});
