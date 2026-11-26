import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  BuyerRequirementsFilter,
  BuyerRequirementWithMatches,
  PaginatedResponse,
} from '@estate-erp/api-client';

/*
 * 받아 둔 희망매물 목록에서 한 줄만 갈아 끼우는 일. 서버를 부르는 것(fetchRow)은 밖에서 받는다 —
 * 캐시를 어떻게 고치는지만 여기 있어서 서버 없이 테스트한다.
 */

type RequirementListFilter = Omit<BuyerRequirementsFilter, 'page' | 'limit'>;
type RequirementListData = InfiniteData<PaginatedResponse<BuyerRequirementWithMatches>, number>;

/** 줄마다 가장 나중에 시작한 다시 받기의 번호. 늦게 도착한 예전 응답이 새 값을 덮지 않게 한다. */
const rowRefreshSeq = new Map<string, number>();
/** 번호는 다시 쓰지 않는다. 끝난 요청의 번호를 다음 요청이 물려받으면 더 오래된 응답이 "가장 새것"으로 보인다. */
let nextRefreshSeq = 0;
const KOREAN_COLLATOR = new Intl.Collator('ko');

/** 서버의 목록 차례(이름 가나다, 같은 손님은 우선순위)에서 이 줄이 저 줄보다 확실히 뒤인가 */
function sortsAfter(row: BuyerRequirementWithMatches, last: BuyerRequirementWithMatches) {
  return KOREAN_COLLATOR.compare(row.contact?.name ?? '', last.contact?.name ?? '') > 0;
}

/**
 * 한 손님의 줄만 다시 받아, 받아 둔 목록의 그 줄을 갈아 끼운다. 목록 전체는 다시 받지 않는다.
 * 매칭 하나가 바뀌었을 때(내가 저장한 직후 · 남이 바꿨다는 실시간 신호) 부른다.
 *
 * 목록마다 조건이 다르므로 그 목록의 조건으로 이 한 줄을 묻는다:
 * - 조건에 맞고 받아 둔 줄이면 새 값으로 바꾼다.
 * - 조건에서 벗어났으면(단계 필터에서 빠졌거나 지워졌다) 줄을 뺀다.
 * - 조건에 새로 들어왔는데 받아 둔 줄에 없으면 자리를 알 수 없으므로 그 목록만 다시 받는다
 *   (아직 받지 않은 쪽이 남아 있으면 그쪽에 있을 수 있으니 그대로 둔다).
 * 지금 화면에 없는 목록은 낡았다고만 표시해, 다시 볼 때 받게 한다.
 */
export async function refreshRequirementRowWith(
  queryClient: QueryClient,
  requirementId: string,
  /** 그 목록의 조건으로 이 한 줄을 받는다. 조건에 맞지 않거나 지워졌으면 undefined */
  fetchRow: (
    filter: RequirementListFilter,
    id: string,
  ) => Promise<BuyerRequirementWithMatches | undefined>,
) {
  const cache = queryClient.getQueryCache();
  const lists = cache.findAll({ queryKey: ['buyer-requirements', 'with-matches', 'list'] });

  await Promise.all(
    lists.map(async (query) => {
      if (!query.isActive()) {
        query.invalidate();
        return;
      }
      const filter = query.queryKey[3] as RequirementListFilter;
      const seqKey = `${query.queryHash}:${requirementId}`;
      nextRefreshSeq += 1;
      const seq = nextRefreshSeq;
      rowRefreshSeq.set(seqKey, seq);
      // 이 목록이 통째로 다시 받는 중이었다면 그 응답은 바뀌기 전 값일 수 있다 — 끝난 뒤 한 번 더 받는다
      const wasFetching = query.state.fetchStatus === 'fetching';

      let fresh: BuyerRequirementWithMatches | undefined;
      try {
        fresh = await fetchRow(filter, requirementId);
      } catch {
        // 한 줄을 못 받았으면 목록을 다시 받게 둔다 (틀린 줄을 남기지 않는다)
        void queryClient.refetchQueries({ queryKey: query.queryKey, exact: true });
        return;
      }
      if (rowRefreshSeq.get(seqKey) !== seq) return;

      const data = query.state.data as RequirementListData | undefined;
      if (!data) return;
      const listed = data.pages.some((page) => page.items.some((item) => item.id === requirementId));
      const lastPage = data.pages.at(-1);
      const allLoaded = (lastPage?.pagination.page ?? 1) >= (lastPage?.pagination.totalPages ?? 1);
      const refetchList = () =>
        void queryClient.refetchQueries({ queryKey: query.queryKey, exact: true });
      if (wasFetching || query.state.fetchStatus === 'fetching') {
        refetchList();
        return;
      }
      // 목록에 드나드는 줄이 있으면 쪽의 경계가 한 칸씩 밀린다. 아직 받지 않은 쪽이 남아 있는데 그 자리에서
      // 줄만 빼거나 두면, 다음 쪽을 받을 때 서버의 시작 자리가 달라져 손님 하나가 빠진다 — 그 목록을 다시 받는다.
      if (listed && !fresh && !allLoaded) {
        refetchList();
        return;
      }
      if (!listed) {
        if (!fresh) return;
        // 받아 둔 마지막 줄보다 확실히 뒤의 손님이면 아직 받지 않은 쪽에 있다 — 받아 둔 쪽은 그대로 맞다.
        // 그 밖에는 받아 둔 범위 안에 새로 들어온 줄이라 자리를 알 수 없으므로 다시 받는다.
        const lastRow = lastPage?.items.at(-1);
        if (!allLoaded && lastRow && sortsAfter(fresh, lastRow)) return;
        refetchList();
        return;
      }

      queryClient.setQueryData<RequirementListData>(query.queryKey, (current) =>
        current && {
          ...current,
          pages: current.pages.map((page) => {
            const next = fresh as BuyerRequirementWithMatches | undefined;
            if (!page.items.some((item) => item.id === requirementId)) {
              return next
                ? page
                : {
                    ...page,
                    pagination: { ...page.pagination, total: Math.max(0, page.pagination.total - 1) },
                  };
            }
            return {
              ...page,
              items: next
                ? page.items.map((item) => (item.id === requirementId ? next : item))
                : page.items.filter((item) => item.id !== requirementId),
              pagination: next
                ? page.pagination
                : { ...page.pagination, total: Math.max(0, page.pagination.total - 1) },
            };
          }),
        },
      );
    }),
  );

  // 조건 없이 받아 둔 한 줄(칸 편집 중 남겨 둔 줄)과 필터 선택지는 가볍다 — 그냥 다시 받는다
  void queryClient.refetchQueries({
    queryKey: ['buyer-requirements', 'with-matches', 'row', requirementId],
    exact: true,
  });
}
