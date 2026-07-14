import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  contractAmountToKorean,
  formatContractAmountHangul,
  formatContractAmountHanja,
  formatContractAmountWithWon,
  formatContractAmountWon,
} from '../src/contract-amount.js';

describe('contract amount formatting (만원 단위 입력)', () => {
  it('formats 0', () => {
    assert.equal(formatContractAmountHangul(0), '일금 영원정');
    assert.equal(formatContractAmountHanja(0), '金零원整');
    assert.equal(formatContractAmountWon(0), '₩0');
    assert.equal(formatContractAmountWithWon(0), '일금 영원정 (₩0)');
  });

  it('formats 1만원 (최소 단위)', () => {
    assert.equal(formatContractAmountHangul(1), '일금 일만원정');
    assert.equal(formatContractAmountHanja(1), '金壹萬원整');
    assert.equal(formatContractAmountWon(1), '₩10,000');
  });

  it('formats the legacy reference example 3.5억 (35000만원)', () => {
    assert.equal(formatContractAmountHangul(35000), '일금 삼억오천만원정');
    assert.equal(formatContractAmountHanja(35000), '金參億五千萬원整');
    assert.equal(
      formatContractAmountWithWon(35000),
      '일금 삼억오천만원정 (₩350,000,000)',
    );
    assert.equal(
      formatContractAmountWithWon(35000, 'hanja'),
      '金參億五千萬원整 (₩350,000,000)',
    );
  });

  it('formats 억 단위 with explicit 일 (계약서 표기 관례)', () => {
    // 15.8억 = 158000만원
    assert.equal(formatContractAmountHangul(158000), '일금 일십오억팔천만원정');
    assert.equal(formatContractAmountHanja(158000), '金壹拾五億八千萬원整');
    assert.equal(formatContractAmountWon(158000), '₩1,580,000,000');
  });

  it('formats 조 단위', () => {
    // 1조원 = 100,000,000만원
    assert.equal(formatContractAmountHangul(100_000_000), '일금 일조원정');
    assert.equal(formatContractAmountHanja(100_000_000), '金壹兆원整');
    assert.equal(formatContractAmountWon(100_000_000), '₩1,000,000,000,000');

    // 1조 2345억 6789만원
    assert.equal(
      formatContractAmountHangul(123_456_789),
      '일금 일조이천삼백사십오억육천칠백팔십구만원정',
    );
  });

  it('never renders sub-만원(천원 이하) units for 만원 단위 입력', () => {
    // 1234만원 → 천/백/십은 만 그룹 내부에만 등장하고, 만 미만 꼬리 단위는 없다.
    assert.equal(formatContractAmountHangul(1234), '일금 일천이백삼십사만원정');
    assert.equal(formatContractAmountHanja(1234), '金壹千貳百參拾四萬원整');

    for (const amount of [1, 1234, 35000, 158000]) {
      const body = contractAmountToKorean(amount, 'hangul');
      // 본문은 항상 만/억/조 그룹 단위로 끝난다 (천원·백원·십원·원 단독 표기 없음)
      assert.match(body, /[만억조]$/, `${amount} → ${body}`);
    }
  });

  it('rejects invalid inputs (음수/소수/비유한값)', () => {
    assert.throws(() => formatContractAmountHangul(-1), TypeError);
    assert.throws(() => formatContractAmountHangul(1.5), TypeError);
    assert.throws(() => formatContractAmountHangul(Number.NaN), TypeError);
    assert.throws(() => formatContractAmountHangul(Number.POSITIVE_INFINITY), TypeError);
    assert.throws(() => formatContractAmountWon(-100), TypeError);
  });
});
