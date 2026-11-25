import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatPhoneWhileTyping,
  isCompletePhone,
  phoneDigits,
  phoneInputProblem,
} from '../src/renderer/lib/phone-format';
import { formatPhone } from '../src/renderer/lib/format';

describe('phone input rule (lib/phone-format.ts)', () => {
  it('stores digits the same way the server does', () => {
    assert.equal(phoneDigits('010-1234-5678'), '01012345678');
    assert.equal(phoneDigits('+82 10-1234-5678'), '01012345678');
    assert.equal(phoneDigits(' (02) 123 4567 '), '021234567');
    assert.equal(phoneDigits(null), '');
  });

  it('adds hyphens while typing, including Seoul 02 and 1588 numbers', () => {
    const cases: Array<[string, string]> = [
      ['010', '010'],
      ['0101234', '010-1234'],
      ['01012345678', '010-1234-5678'],
      ['010123456789', '010-1234-5678'],
      ['021234567', '02-123-4567'],
      ['0212345678', '02-1234-5678'],
      ['0311234567', '031-123-4567'],
      ['15881234', '1588-1234'],
      ['010-abc-12', '010-12'],
    ];
    for (const [raw, expected] of cases) assert.equal(formatPhoneWhileTyping(raw), expected, raw);
  });

  it('agrees with the display rule once the number is complete', () => {
    for (const raw of ['01012345678', '0212345678', '021234567', '0311234567', '15881234']) {
      assert.equal(formatPhoneWhileTyping(raw), formatPhone(raw), raw);
      assert.equal(isCompletePhone(raw), true, raw);
    }
    assert.equal(isCompletePhone('0101234'), false);
  });

  it('explains only real problems under the field', () => {
    assert.equal(phoneInputProblem(''), null);
    assert.equal(phoneInputProblem('010-1234-5678'), null);
    assert.match(phoneInputProblem('010-1234-567o') ?? '', /숫자만/);
    assert.match(phoneInputProblem('010-123') ?? '', /끝까지/);
  });
});
