import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeManwonText,
  parseManwonText,
  requireManwon,
} from '../src/renderer/routes/_authenticated/properties/-manwon-input';

describe('manwon text input', () => {
  it('reads amounts the way brokers say them', () => {
    const cases: Array<[string, number]> = [
      ['15억', 150000],
      ['15.8억', 158000],
      ['15억 8천', 158000],
      ['15억8000', 158000],
      ['15억 8,000만', 158000],
      ['9억5천만', 95000],
      ['5천', 5000],
      ['5000만', 5000],
      ['3억 5백', 30500],
      ['158000', 158000],
      ['158,000', 158000],
      ['350', 350],
      ['0', 0],
      ['１５억', 150000],
      ['15억원', 150000],
    ];
    for (const [input, expected] of cases) {
      assert.deepEqual(parseManwonText(input), { valid: true, value: expected }, input);
    }
  });

  it('treats blank as no value and rejects what it cannot read', () => {
    assert.deepEqual(parseManwonText('  '), { valid: true, value: null });
    for (const input of ['abc', '-5', '15.5', '억', '15억 abc', '1e5']) {
      assert.deepEqual(parseManwonText(input), { valid: false }, input);
    }
  });

  it('explains the value next to the field and blocks saving unreadable text', () => {
    assert.deepEqual(describeManwonText('15억 8천'), { text: '= 15억 8,000만', invalid: false });
    assert.equal(describeManwonText('abc').invalid, true);
    assert.equal(requireManwon('', '매매가를'), undefined);
    assert.equal(requireManwon('9억', '전세가를'), 90000);
    assert.throws(() => requireManwon('구억', '전세가를'), /전세가를 다시 확인하세요/);
  });
});
