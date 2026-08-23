import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from '../../../packages/api-client/src/client.ts';
import type { AuthFailureContext } from '../../../packages/api-client/src/types.ts';

test('401 callback은 실제 Bearer 전송 여부를 구분한다', async (context) => {
  const originalFetch = globalThis.fetch;
  const authorizationHeaders: Array<string | undefined> = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    authorizationHeaders.push(headers?.Authorization);
    return new Response(JSON.stringify({ message: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const failures: AuthFailureContext[] = [];
  await assert.rejects(
    request(
      {
        baseUrl: 'https://example.test',
        getToken: () => 'rejected-token',
        onAuthFailure: (failure) => failures.push(failure),
      },
      '/with-bearer',
    ),
  );
  await assert.rejects(
    request(
      {
        baseUrl: 'https://example.test',
        getToken: () => null,
        onAuthFailure: (failure) => failures.push(failure),
      },
      '/without-bearer',
    ),
  );

  assert.deepEqual(authorizationHeaders, [
    'Bearer rejected-token',
    undefined,
  ]);
  assert.deepEqual(failures, [{ hadBearer: true }, { hadBearer: false }]);
});
