import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareUnitSpaces,
  countFloors,
  formatFloor,
  formatFloorRange,
  formatUnitLabel,
  parseFloorInput,
} from '../src/place.ts';

describe('unit space labels', () => {
  it('writes basement floors as B2 and ground floors as 3층', () => {
    assert.equal(formatFloor(-2), 'B2');
    assert.equal(formatFloor(3), '3층');
    assert.equal(formatFloor(0), '');
    assert.equal(formatFloor(null), '');
  });

  it('writes a range once, and keeps B when it crosses the ground', () => {
    assert.equal(formatFloorRange({ floor: 1, floorEnd: 2 }), '1~2층');
    assert.equal(formatFloorRange({ floor: -1, floorEnd: 2 }), 'B1~2층');
    assert.equal(formatFloorRange({ floor: -2, floorEnd: -1 }), 'B2~B1');
    assert.equal(formatFloorRange({ floor: 3 }), '3층');
    // 숫자로 안 떨어지는 층은 표시 이름이 이긴다
    assert.equal(formatFloorRange({ floor: -1, floorLabel: '반지하' }), '반지하');
  });

  it('reads the ways people type a floor, and refuses to guess', () => {
    for (const text of ['B2', 'b2', '지하2', '지하 2층', '-2', 'B2F']) {
      assert.equal(parseFloorInput(text), -2, text);
    }
    for (const text of ['3', '3층', '3F', '지상3층', ' 3 ']) {
      assert.equal(parseFloorInput(text), 3, text);
    }
    for (const text of ['', '0', 'B0', '반지하', '옥탑', '저', '3.5', '고층']) {
      assert.equal(parseFloorInput(text), null, text);
    }
  });

  it('counts floors without a floor zero', () => {
    assert.equal(countFloors({ floor: 2 }), 1);
    assert.equal(countFloors({ floor: 1, floorEnd: 3 }), 3);
    assert.equal(countFloors({ floor: -1, floorEnd: 2 }), 3);
    assert.equal(countFloors({ floor: -2, floorEnd: -1 }), 2);
    assert.equal(countFloors({}), null);
  });

  it('names a space by its ho, or by its floor when there is no ho', () => {
    assert.equal(formatUnitLabel({ name: '3501', floor: 35 }), '3501호');
    assert.equal(formatUnitLabel({ name: 'B103', floor: -1 }), 'B103호');
    assert.equal(formatUnitLabel({ name: '101-1', floor: 1 }), '101-1호');
    assert.equal(formatUnitLabel({ name: '3501호', floor: 35 }), '3501호');
    assert.equal(formatUnitLabel({ floor: 2 }), '2층');
    assert.equal(formatUnitLabel({ floor: -2 }), 'B2');
    assert.equal(formatUnitLabel({ floor: 1, floorEnd: 2 }), '1~2층');
    assert.equal(formatUnitLabel({ name: '좌측', floor: 2 }), '2층 좌측');
    assert.equal(formatUnitLabel({ name: '  ', floor: 2 }), '2층');
    assert.equal(formatUnitLabel(null), '');
    assert.equal(formatUnitLabel({}), '');
  });

  it('sorts spaces by floor then name, including spaces without a name', () => {
    const spaces = [{ floor: 2 }, { name: '102', floor: 1 }, { floor: -1 }, { name: '101', floor: 1 }];
    assert.deepEqual(
      spaces.sort(compareUnitSpaces).map((space) => formatUnitLabel(space)),
      ['B1', '101호', '102호', '2층'],
    );
  });
});

describe('place label', () => {
  it('names a home as complex + dong + ho', async () => {
    const { formatDongLabel, formatPlaceLabel } = await import('../src/place.ts');
    assert.equal(formatDongLabel('102'), '102동');
    assert.equal(formatDongLabel('102동'), '102동');
    assert.equal(formatDongLabel('A'), 'A동');
    assert.equal(formatDongLabel('상가동'), '상가동');
    assert.equal(formatDongLabel('본관'), '본관');
    // 동 구분 없는 건물은 "-"를 찍지 않는다
    assert.equal(formatDongLabel('-'), '');
    assert.equal(formatDongLabel('1', true), '');

    assert.equal(
      formatPlaceLabel({ siteName: '고덕그라시움', dongName: '102', unit: { name: '2203' } }),
      '고덕그라시움 102동 2203호',
    );
    assert.equal(formatPlaceLabel({ dongName: '102', unit: { name: '2203' } }), '102동 2203호');
    assert.equal(
      formatPlaceLabel({ siteName: '고덕빌라', dongName: '-', dongIsPlaceholder: true, unit: { name: '201' } }),
      '고덕빌라 201호',
    );
    assert.equal(formatPlaceLabel({ siteName: '중앙상가', dongName: '-', unit: { floor: 2 } }), '중앙상가 2층');
    // 단독주택 · 토지: 건물 이름만
    assert.equal(formatPlaceLabel({ siteName: '고덕동 123-4' }), '고덕동 123-4');
    assert.equal(formatPlaceLabel(null), '');
  });
});
