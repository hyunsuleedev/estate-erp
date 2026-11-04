import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPostcodeFrameRedirect } from '../src/main/embeddedAddressNavigation';

test('allows only the HTTPS postcode search redirect in a subframe', () => {
  assert.equal(
    isPostcodeFrameRedirect(
      'https://postcode.map.kakao.com/search?origin=http%3A%2F%2Flocalhost',
      false,
    ),
    true,
  );
  assert.equal(
    isPostcodeFrameRedirect('https://postcode.map.kakao.com/search', true),
    false,
  );
  for (const url of [
    'http://postcode.map.kakao.com/search',
    'https://postcode.map.kakao.com.evil.example/search',
    'https://postcode.map.kakao.com/other',
    'https://postcode.map.kakao.com:8443/search',
    'https://user:password@postcode.map.kakao.com/search',
    'javascript:alert(1)',
  ]) {
    assert.equal(isPostcodeFrameRedirect(url, false), false);
  }
});
