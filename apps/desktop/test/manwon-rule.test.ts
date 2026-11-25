import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeManwon,
  formatManwonEcho,
  MAX_MANWON,
  parseManwon,
} from '../src/renderer/lib/manwon';
import { parseManwonText as parsePropertyManwon } from '../src/renderer/routes/_authenticated/properties/-manwon-input';
import { parseManwonText as parseWantedManwon } from '../src/renderer/routes/_authenticated/wanted-properties/-money-text';
import { parseCellNumber } from '../src/renderer/components/data-table/cell-edit-state';

/**
 * 금액 글자 읽기 규칙표. 매물 등록·희망매물·거래·공용 표의 만원 칸이 모두 이 표대로 읽는다.
 * (2026-11-22 이전에는 화면마다 따로 읽어 "3억 5백"·"1.5천"·"1조" 등이 화면마다 달랐다.)
 */
const READS: Array<[string, number | null]> = [
  ['15억', 150_000],
  ['15.8억', 158_000],
  ['15억 8천', 158_000],
  ['15억8000', 158_000],
  ['15억 8,000만', 158_000],
  ['9억5천만', 95_000],
  ['9억 5000', 95_000],
  ['3억 5백', 30_500],
  ['1.5천', 1_500],
  ['5천', 5_000],
  ['5000만', 5_000],
  ['5천만원', 5_000],
  ['158000', 158_000],
  ['158,000', 158_000],
  ['1,580', 1_580],
  ['350', 350],
  ['0', 0],
  ['１５억', 150_000],
  ['15억원', 150_000],
  ['1조 2000억', 120_000_000],
  ['  ', null],
  ['', null],
];

const REJECTS = ['abc', '-5', '-15억', '15.5', '158000.5', '억', '만', '구억', '이십억', '15억 abc', '9억 abc', '1e5', '+5', '99999999999'];

describe('manwon rule (lib/manwon.ts)', () => {
  it('reads amounts the way brokers say them', () => {
    for (const [input, expected] of READS) {
      assert.deepEqual(parseManwon(input), { valid: true, value: expected }, input);
    }
  });

  it('rejects what it cannot read instead of guessing', () => {
    for (const input of REJECTS) {
      assert.deepEqual(parseManwon(input), { valid: false }, input);
    }
    assert.deepEqual(parseManwon(String(MAX_MANWON)), { valid: true, value: MAX_MANWON });
    assert.deepEqual(parseManwon(String(MAX_MANWON + 1)), { valid: false });
  });

  it('echoes the value in the same words as the lists', () => {
    assert.equal(formatManwonEcho(158_000), '= 15억 8,000만');
    assert.equal(formatManwonEcho(5_000), '= 5,000만');
    assert.equal(formatManwonEcho(0), '= 0');
    assert.deepEqual(describeManwon('15억 8천'), { text: '= 15억 8,000만', invalid: false });
    assert.deepEqual(describeManwon(''), { text: undefined, invalid: false });
    assert.equal(describeManwon('abc').invalid, true);
  });

  it('is the one rule behind every screen', () => {
    for (const [input, expected] of READS) {
      assert.deepEqual(parsePropertyManwon(input), { valid: true, value: expected }, `매물 ${input}`);
      assert.equal(parseWantedManwon(input), expected, `희망매물 ${input}`);
      assert.deepEqual(parseCellNumber(input, 0, '만원'), { valid: true, value: expected }, `표 칸 ${input}`);
    }
    for (const input of REJECTS) {
      assert.deepEqual(parsePropertyManwon(input), { valid: false }, `매물 ${input}`);
      assert.ok(Number.isNaN(parseWantedManwon(input)), `희망매물 ${input}`);
      assert.equal(parseCellNumber(input, 0, '만원').valid, false, `표 칸 ${input}`);
    }
    // 단위를 주지 않은 숫자 칸은 예전 규칙 그대로(억·천을 받지 않는다)
    assert.equal(parseCellNumber('15억', 0).valid, false);
  });
});
