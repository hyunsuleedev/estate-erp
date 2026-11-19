import assert from 'node:assert/strict';
import { it } from 'node:test';
import { formatPropertySpaceLabel, registrationSpace } from '../src/renderer/routes/_authenticated/properties/-registration-space';

it('distinguishes the whole site, a whole dong and a continuous floor range', () => {
  assert.equal(registrationSpace({ scope: 'whole' }, false), null);
  assert.equal(formatPropertySpaceLabel(null, 'commercial'), '건물 전체');
  assert.equal(formatPropertySpaceLabel(null, 'land'), '');
  assert.equal(formatPropertySpaceLabel(registrationSpace({ scope: 'whole' }, true)), '건물 전체');
  for (const [startFloor, endFloor, label] of [['2', '4', '2~4층'], ['B1', '2', 'B1~2층'], ['2', '2', '2층']]) {
    assert.equal(formatPropertySpaceLabel(registrationSpace({ scope: 'floors', startFloor, endFloor }, false)), label);
  }
});

it('preserves the part name and area and rejects invalid space descriptions', () => {
  const part = registrationSpace({ scope: 'unit', partName: ' 안쪽 ', startFloor: '2층', partArea: '30' }, false);
  assert.deepEqual(part, { name: '안쪽', floor: 2, floorEnd: null, exclusiveAreaM2: 30 });
  assert.equal(formatPropertySpaceLabel(part), '2층 안쪽');
  assert.throws(() => registrationSpace({ scope: 'floors', startFloor: '0' }, false));
  assert.throws(() => registrationSpace({ scope: 'floors', startFloor: '4', endFloor: '2' }, false));
  assert.throws(() => registrationSpace({ scope: 'unit', partName: '안쪽', partArea: '-1' }, false));
});
