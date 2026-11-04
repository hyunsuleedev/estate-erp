import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCodeDeliveryParams,
  getCodeVerificationParams,
  getSignInCodeFactor,
} from '../src/renderer/lib/sign-in-verification.ts';

const email = {
  strategy: 'email_code' as const,
  emailAddressId: 'email_for_sign_in',
  safeIdentifier: 't***@example.com',
};

test('Device Trust uses the offered email factor for both Clerk status versions', () => {
  for (const status of ['needs_second_factor', 'needs_client_trust'] as const) {
    const factor = getSignInCodeFactor({ status, supportedSecondFactors: [email] });
    assert.deepEqual(factor, email);
    assert.deepEqual(getCodeDeliveryParams(factor!), {
      strategy: 'email_code', emailAddressId: 'email_for_sign_in',
    });
    assert.deepEqual(getCodeVerificationParams(factor!, ' 123456 '), {
      strategy: 'email_code', code: '123456',
    });
  }
});

test('enabled authenticator MFA stays TOTP and does not request a message', () => {
  const factor = getSignInCodeFactor({
    status: 'needs_second_factor',
    supportedSecondFactors: [{ strategy: 'backup_code' }, { strategy: 'totp' }],
  });
  assert.deepEqual(factor, { strategy: 'totp' });
  assert.equal(getCodeDeliveryParams(factor!), null);
  assert.deepEqual(getCodeVerificationParams(factor!, '123456'), {
    strategy: 'totp', code: '123456',
  });
});

test('SMS preparation uses the phone identity offered by Clerk', () => {
  const factor = getSignInCodeFactor({
    status: 'needs_client_trust',
    supportedSecondFactors: [{ strategy: 'phone_code', phoneNumberId: 'phone_for_sign_in', safeIdentifier: '+82****1234' }],
  });
  assert.deepEqual(getCodeDeliveryParams(factor!), {
    strategy: 'phone_code', phoneNumberId: 'phone_for_sign_in',
  });
});

test('backup-code-only accounts can verify without a delivery request', () => {
  const factor = getSignInCodeFactor({ status: 'needs_second_factor', supportedSecondFactors: [{ strategy: 'backup_code' }] });
  assert.equal(getCodeDeliveryParams(factor!), null);
  assert.deepEqual(getCodeVerificationParams(factor!, 'back-up-code'), {
    strategy: 'backup_code', code: 'back-up-code',
  });
});

test('missing or unsupported factors never fall back to an invented TOTP challenge', () => {
  assert.equal(getSignInCodeFactor({ status: 'needs_second_factor', supportedSecondFactors: null }), null);
  assert.equal(getSignInCodeFactor({ status: 'needs_client_trust', supportedSecondFactors: [{ ...email, strategy: 'email_link' }] }), null);
});

test('first-factor and completed attempts do not open a second-factor form', () => {
  for (const status of ['needs_first_factor', 'complete'] as const) {
    assert.equal(getSignInCodeFactor({ status, supportedSecondFactors: [email] }), null);
  }
});

test('blank verification codes are rejected before an API request', () => {
  assert.throws(() => getCodeVerificationParams(email, '  '), /인증 코드를 입력/);
});
