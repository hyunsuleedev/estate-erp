import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QueryClient, InfiniteQueryObserver } from '@tanstack/react-query';

type RefreshRequirementRow = (
  client: QueryClient,
  id: string,
  fetchRow: (filter: Record<string, unknown>, id: string) => Promise<unknown>,
) => Promise<void>;

async function refreshRequirementRow(...args: Parameters<RefreshRequirementRow>) {
  const loaded = (await import('../src/renderer/queries/requirement-row-cache.ts')) as unknown as Record<
    string,
    unknown
  >;
  const module = (loaded.default ?? loaded) as { refreshRequirementRowWith: RefreshRequirementRow };
  return module.refreshRequirementRowWith(...args);
}

type Row = {
  id: string;
  contact: { name: string };
  updatedAt: string;
  matches: Array<{ id: string; stage: string }>;
};
const row = (id: string, stage = 'viewing', updatedAt = '1', name = id) => ({
  id,
  contact: { name },
  updatedAt,
  matches: [{ id: `m-${id}`, stage }],
});
const page = (items: Row[], pageNo = 1, totalPages = 1) => ({
  items,
  pagination: { page: pageNo, limit: 50, total: items.length, totalPages },
});

/** 받아 둔 목록 하나를 화면에 떠 있는 것처럼(지켜보는 쪽이 있게) 만든다 */
function mountList(client: QueryClient, filter: Record<string, unknown>, pages: unknown[]) {
  const queryKey = ['buyer-requirements', 'with-matches', 'list', filter];
  let listFetches = 0;
  client.setQueryData(queryKey, { pages, pageParams: pages.map((_, index) => index + 1) });
  const observer = new InfiniteQueryObserver(client, {
    queryKey,
    initialPageParam: 1,
    staleTime: Infinity,
    queryFn: async () => {
      listFetches += 1;
      return page([row('refetched')]);
    },
    getNextPageParam: () => undefined,
  });
  const stop = observer.subscribe(() => undefined);
  const rows = () =>
    (client.getQueryData(queryKey) as { pages: Array<{ items: Row[] }> }).pages.flatMap(
      (item) => item.items,
    );
  return { queryKey, rows, stop, listFetches: () => listFetches };
}

describe('희망매물: 매칭 하나가 바뀌면 그 손님 한 줄만 갈아 끼운다', () => {
  it('목록 전체를 다시 받지 않고 그 줄만 새 값으로 바꾼다 (다른 줄은 같은 객체 그대로)', async () => {
    const client = new QueryClient();
    const untouched = row('b');
    const list = mountList(client, { status: 'active,hold' }, [page([row('a'), untouched])]);
    const asked: unknown[] = [];

    await refreshRequirementRow(client, 'a', async (filter, id) => {
      asked.push([filter, id]);
      return row('a', 'negotiating', '2');
    });

    // 그 목록의 조건으로 그 한 줄만 물었다
    assert.deepEqual(asked, [[{ status: 'active,hold' }, 'a']]);
    assert.equal(list.listFetches(), 0);
    assert.equal(list.rows()[0].matches[0].stage, 'negotiating');
    assert.equal(list.rows()[1], untouched);
    list.stop();
  });

  it('조건에서 벗어난 줄(단계 필터에서 빠졌거나 지워졌다)은 빼고 건수를 줄인다', async () => {
    const client = new QueryClient();
    const list = mountList(client, { matchStages: 'viewing' }, [page([row('a'), row('b')])]);

    await refreshRequirementRow(client, 'a', async () => undefined);

    assert.deepEqual(list.rows().map((item) => item.id), ['b']);
    const data = client.getQueryData(list.queryKey) as { pages: Array<{ pagination: { total: number } }> };
    assert.equal(data.pages[0].pagination.total, 1);
    assert.equal(list.listFetches(), 0);
    list.stop();
  });

  it('조건에 새로 들어온 줄은 자리를 알 수 없으므로 그 목록만 다시 받는다', async () => {
    const client = new QueryClient();
    const list = mountList(client, { matchStages: 'negotiating' }, [page([row('b', 'negotiating')])]);

    await refreshRequirementRow(client, 'a', async () => row('a', 'negotiating'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(list.listFetches(), 1);
    list.stop();
  });

  it('아직 받지 않은 쪽에 있는 손님(받아 둔 마지막 줄보다 뒤)은 그대로 둔다', async () => {
    const client = new QueryClient();
    const list = mountList(client, {}, [page([row('b', 'viewing', '1', '나')], 1, 3)]);

    await refreshRequirementRow(client, 'z', async () => row('z', 'viewing', '1', '하'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(list.listFetches(), 0);
    assert.deepEqual(list.rows().map((item) => item.id), ['b']);
    list.stop();
  });

  it('받지 않은 쪽이 남아 있는데 줄이 드나들면 쪽의 경계가 밀리므로 그 목록을 다시 받는다', async () => {
    // 51명 중 50명을 받은 채 한 명을 빼기만 하면, 다음 쪽의 시작 자리가 밀려 마지막 손님이 빠진다
    const leaving = new QueryClient();
    const left = mountList(leaving, { matchStages: 'viewing' }, [page([row('a'), row('b')], 1, 2)]);
    await refreshRequirementRow(leaving, 'a', async () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(left.listFetches(), 1);
    left.stop();

    // 받아 둔 범위 안으로 새로 들어온 손님
    const entering = new QueryClient();
    const entered = mountList(entering, {}, [page([row('b', 'viewing', '1', '나')], 1, 3)]);
    await refreshRequirementRow(entering, 'a', async () => row('a', 'viewing', '1', '가'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(entered.listFetches(), 1);
    entered.stop();
  });

  it('늦게 도착한 예전 응답은 새 값을 덮지 않는다', async () => {
    const client = new QueryClient();
    const list = mountList(client, {}, [page([row('a')])]);
    let releaseOld: (value: Row) => void = () => undefined;
    const old = refreshRequirementRow(
      client,
      'a',
      () => new Promise<Row>((resolve) => { releaseOld = resolve; }),
    );
    await refreshRequirementRow(client, 'a', async () => row('a', 'negotiating', '3'));
    releaseOld(row('a', 'buyerInterested', '2'));
    await old;

    assert.equal(list.rows()[0].matches[0].stage, 'negotiating');
    list.stop();
  });

  it('끝난 요청의 번호를 물려받지 않는다: A 시작 → B 끝 → C 시작 → A 끝 → C 끝이면 C가 남는다', async () => {
    const client = new QueryClient();
    const list = mountList(client, {}, [page([row('a')])]);
    const gate = () => {
      let release: (value: Row) => void = () => undefined;
      const promise = new Promise<Row>((resolve) => { release = resolve; });
      return { promise, release };
    };
    const a = gate();
    const c = gate();
    const first = refreshRequirementRow(client, 'a', () => a.promise);
    await refreshRequirementRow(client, 'a', async () => row('a', 'buyerInterested', '2'));
    const third = refreshRequirementRow(client, 'a', () => c.promise);
    a.release(row('a', 'suggested', '1'));
    await first;
    c.release(row('a', 'negotiating', '3'));
    await third;

    assert.equal(list.rows()[0].matches[0].stage, 'negotiating');
    list.stop();
  });

  it('지금 화면에 없는 목록은 요청하지 않고 낡았다고만 표시한다', async () => {
    const client = new QueryClient();
    const queryKey = ['buyer-requirements', 'with-matches', 'list', { transactionType: 'jeonse' }];
    client.setQueryData(queryKey, { pages: [page([row('a')])], pageParams: [1] });
    let asked = 0;

    await refreshRequirementRow(client, 'a', async () => {
      asked += 1;
      return row('a');
    });

    assert.equal(asked, 0);
    assert.equal(client.getQueryState(queryKey)?.isInvalidated, true);
  });
});
