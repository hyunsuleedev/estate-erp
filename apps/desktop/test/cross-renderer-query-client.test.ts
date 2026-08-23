import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CrossRendererQueryClient,
  isBroadcastableQueryKey,
} from '../src/renderer/lib/cross-renderer-query-client';

function makeClient(broadcasts: unknown[][]) {
  return new CrossRendererQueryClient(
    { defaultOptions: { queries: { retry: false } } },
    (queryKey) => broadcasts.push([...queryKey]),
  );
}

test('업무와 매물 mutation의 명시적 invalidation key를 그대로 broadcast한다', async () => {
  const broadcasts: unknown[][] = [];
  const client = makeClient(broadcasts);

  await client.invalidateQueries({ queryKey: ['tasks'] });
  await client.invalidateQueries({ queryKey: ['properties', 'property-1'] });
  await client.invalidateQueries({ queryKey: ['listings'] });

  assert.deepEqual(broadcasts, [
    ['tasks'],
    ['properties', 'property-1'],
    ['listings'],
  ]);
});

test('원격 invalidation은 해당 prefix만 stale로 만들고 다시 broadcast하지 않는다', async () => {
  const broadcasts: unknown[][] = [];
  const client = makeClient(broadcasts);
  client.setQueryData(['properties', 'property-1'], { id: 'property-1' });
  client.setQueryData(['properties', 'property-2'], { id: 'property-2' });

  await client.invalidateQueriesFromRemote(['properties', 'property-1']);

  assert.equal(
    client.getQueryState(['properties', 'property-1'])?.isInvalidated,
    true,
  );
  assert.equal(
    client.getQueryState(['properties', 'property-2'])?.isInvalidated,
    false,
  );
  assert.deepEqual(broadcasts, []);
});

test('전체·predicate·exact·options invalidation은 의미를 넓히지 않고 로컬에만 적용한다', async () => {
  const broadcasts: unknown[][] = [];
  const client = makeClient(broadcasts);
  client.setQueryData(['tasks'], []);

  await client.invalidateQueries();
  await client.invalidateQueries({
    queryKey: ['tasks'],
    predicate: () => true,
  });
  await client.invalidateQueries({ queryKey: ['tasks'], exact: true });
  await client.invalidateQueries(
    { queryKey: ['tasks'] },
    { cancelRefetch: false },
  );

  assert.equal(client.getQueryState(['tasks'])?.isInvalidated, true);
  assert.deepEqual(broadcasts, []);
});

test('IPC 비호환 key와 broadcaster 오류가 로컬 invalidation을 깨지 않는다', async () => {
  const cyclic: unknown[] = ['tasks'];
  cyclic.push(cyclic);
  assert.equal(isBroadcastableQueryKey([]), false);
  assert.equal(isBroadcastableQueryKey(cyclic), false);
  assert.equal(isBroadcastableQueryKey(['tasks', Number.NaN]), false);
  assert.equal(
    isBroadcastableQueryKey(['listings', { propertyId: 'property-1' }]),
    true,
  );

  const client = new CrossRendererQueryClient({}, () => {
    throw new Error('ipc unavailable');
  });
  client.setQueryData(['tasks'], []);

  await assert.doesNotReject(
    client.invalidateQueries({ queryKey: ['tasks'] }),
  );
  assert.equal(client.getQueryState(['tasks'])?.isInvalidated, true);
});
