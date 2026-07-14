import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './normalize.js';

test('일반 휴대폰 번호 — 대시 제거', () => {
  assert.deepEqual(normalizePhone('010-1234-5678'), {
    phoneNumber: '01012345678',
    isPrivate: false,
  });
});

test('82 국가번호 → 0 변환 (레거시 m_MyCallRecv 규칙)', () => {
  assert.deepEqual(normalizePhone('821012345678'), {
    phoneNumber: '01012345678',
    isPrivate: false,
  });
  assert.deepEqual(normalizePhone('+82-10-1234-5678'), {
    phoneNumber: '01012345678',
    isPrivate: false,
  });
});

test('3자리 미만 → 발신표시제한(Private)', () => {
  assert.deepEqual(normalizePhone('12'), { phoneNumber: '', isPrivate: true });
  assert.deepEqual(normalizePhone(''), { phoneNumber: '', isPrivate: true });
  assert.deepEqual(normalizePhone('Private'), {
    phoneNumber: '',
    isPrivate: true,
  });
  assert.deepEqual(normalizePhone(null), { phoneNumber: '', isPrivate: true });
});

test('짧은 82x 번호는 국가번호로 취급하지 않음', () => {
  // 지역번호/내선 등 82로 시작하는 짧은 번호를 잘못 변환하면 안 됨
  assert.deepEqual(normalizePhone('821234'), {
    phoneNumber: '821234',
    isPrivate: false,
  });
});

test('서울 유선 번호', () => {
  assert.deepEqual(normalizePhone('02-123-4567'), {
    phoneNumber: '021234567',
    isPrivate: false,
  });
});
