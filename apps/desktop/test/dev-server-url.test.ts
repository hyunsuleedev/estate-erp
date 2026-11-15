import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEV_SERVER_URL_ENV, resolveDevServerUrl } from '../src/main/devServerUrl';

describe('renderer dev server address', () => {
  it('reads the address electron-vite passes to a development run', () => {
    assert.equal(DEV_SERVER_URL_ENV, 'ELECTRON_RENDERER_URL');
    assert.equal(
      resolveDevServerUrl({
        packaged: false,
        env: { ELECTRON_RENDERER_URL: 'http://localhost:5174' },
      }),
      'http://localhost:5174',
    );
    // 문서 주소는 이 값 뒤에 `/`를 붙여 만든다. 끝의 `/`와 경로는 떼어 낸다.
    assert.equal(
      resolveDevServerUrl({
        packaged: false,
        env: { ELECTRON_RENDERER_URL: ' http://localhost:5174/ ' },
      }),
      'http://localhost:5174',
    );
  });

  it('is ignored by a packaged app', () => {
    // 실행 환경 변수 하나로 설치된 앱이 아무 주소나 열게 되면 안 된다(그 화면에 preload가 붙는다).
    assert.equal(
      resolveDevServerUrl({
        packaged: true,
        env: { ELECTRON_RENDERER_URL: 'http://localhost:5174' },
      }),
      undefined,
    );
    assert.equal(
      resolveDevServerUrl({
        packaged: true,
        env: { ELECTRON_RENDERER_URL: 'https://attacker.example' },
      }),
      undefined,
    );
  });

  it('has no dev server when the variable is missing or empty', () => {
    assert.equal(resolveDevServerUrl({ packaged: false, env: {} }), undefined);
    assert.equal(
      resolveDevServerUrl({ packaged: false, env: { ELECTRON_RENDERER_URL: '  ' } }),
      undefined,
    );
  });

  it('accepts only http(s) addresses', () => {
    for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'estate-erp://app', 'not a url']) {
      assert.equal(
        resolveDevServerUrl({ packaged: false, env: { ELECTRON_RENDERER_URL: value } }),
        undefined,
        value,
      );
    }
  });
});
