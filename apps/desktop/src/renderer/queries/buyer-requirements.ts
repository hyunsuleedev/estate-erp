import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  BuyerRequirementsFilter,
  BuyerRequirementWithMatches,
  MatchRow,
  PaginatedResponse,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { refreshWantedRowWith } from './wanted-row-cache';

/** 희망매물 목록이 한 번에 받는 손님 수. 아래로 굴리면 다음 쪽을 이어 받는다. */
export const WANTED_PAGE_SIZE = 50;

/** 희망매물 목록의 조건. 쪽 번호와 쪽 크기는 조회가 정한다. */
export type WantedListFilter = Omit<BuyerRequirementsFilter, 'page' | 'limit'>;

/**
 * 구매 희망조건의 조회 정의. 조회 키는 이 파일에서만 정한다.
 * 희망매물 목록의 줄은 `{ 손님 조건, 그 손님의 매칭들 }`이다 — 매칭을 따로 받아 화면에서 묶지 않는다.
 */
export const buyerRequirementQueries = {
  all: ['buyer-requirements'] as const,
  wantedAll: ['buyer-requirements', 'wanted'] as const,

  /** 희망매물 목록: 조건 · 검색 · 정렬은 서버가 하고, 쪽 단위로 이어 받는다 */
  wanted: (filter: WantedListFilter) =>
    infiniteQueryOptions({
      queryKey: ['buyer-requirements', 'wanted', 'list', filter] as const,
      initialPageParam: 1,
      queryFn: ({ pageParam }) =>
        api.buyerRequirements.findAllWithMatches({
          ...filter,
          sortBy: 'name',
          page: pageParam,
          limit: WANTED_PAGE_SIZE,
        }),
      getNextPageParam: (lastPage) =>
        lastPage.pagination.page < lastPage.pagination.totalPages
          ? lastPage.pagination.page + 1
          : undefined,
    }),

  /** 목록의 줄과 같은 꼴로 받는 한 줄. 조건에 걸리지 않아도(상태 · 필터) 받는다. */
  wantedRow: (id: string | null) =>
    queryOptions({
      queryKey: ['buyer-requirements', 'wanted', 'row', id] as const,
      queryFn: async () => {
        const result = await api.buyerRequirements.findAllWithMatches({
          ids: id as string,
          limit: 1,
        });
        return result.items[0] ?? null;
      },
    }),

  /** 희망매물 필터의 선택지 (지금 조건들에 있는 지역 · 단지 · 담당자) */
  wantedFilterOptions: (status: string) =>
    queryOptions({
      queryKey: ['buyer-requirements', 'wanted', 'filter-options', status] as const,
      queryFn: () => api.buyerRequirements.filterOptions(status),
    }),
};

type WantedPage = PaginatedResponse<BuyerRequirementWithMatches>;
type WantedListData = InfiniteData<WantedPage, number>;

/** 받아 둔 쪽들을 한 목록으로. 쪽을 받는 사이 줄이 옮겨 가 두 쪽에 걸쳐 온 것은 한 번만 싣는다. */
export function mergeWantedPages(pages: WantedPage[] | undefined): BuyerRequirementWithMatches[] {
  const seen = new Set<string>();
  const rows: BuyerRequirementWithMatches[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(item);
    }
  }
  return rows;
}

/**
 * 받아 둔 희망매물 줄을 그 자리에서 고친다 (조건이 다른 목록들과 한 줄 조회 모두).
 * 서버의 정확한 값은 뒤따르는 다시 받기가 가져온다 — 이것은 그 사이 화면이 곧장 바뀌게 하는 것이다.
 */
export function updateWantedRows(
  queryClient: QueryClient,
  update: (rows: BuyerRequirementWithMatches[]) => BuyerRequirementWithMatches[] | undefined,
): void {
  queryClient.setQueriesData<WantedListData>(
    { queryKey: ['buyer-requirements', 'wanted', 'list'] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({ ...page, items: update(page.items) ?? page.items })),
      },
  );
  queryClient.setQueriesData<BuyerRequirementWithMatches | null>(
    { queryKey: ['buyer-requirements', 'wanted', 'row'] },
    (row) => (row ? (update([row])?.[0] ?? row) : row),
  );
}

/** 받아 둔 줄 가운데 이 조건의 가장 새 값 */
export function findWantedRow(
  queryClient: QueryClient,
  id: string,
): BuyerRequirementWithMatches | undefined {
  let found: BuyerRequirementWithMatches | undefined;
  const consider = (row: BuyerRequirementWithMatches | null | undefined) => {
    if (row && row.id === id && (!found || row.updatedAt > found.updatedAt)) found = row;
  };
  for (const [, data] of queryClient.getQueriesData<WantedListData>({
    queryKey: ['buyer-requirements', 'wanted', 'list'],
  })) {
    for (const page of data?.pages ?? []) page.items.forEach(consider);
  }
  for (const [, row] of queryClient.getQueriesData<BuyerRequirementWithMatches | null>({
    queryKey: ['buyer-requirements', 'wanted', 'row'],
  })) {
    consider(row);
  }
  return found;
}

/** 받아 둔 줄 안의 매칭 하나를 고친 칸만 덮는다 (메모 · 합의 조건을 저장한 직후) */
export function patchWantedMatch(
  queryClient: QueryClient,
  matchId: string,
  patch: Partial<MatchRow>,
): void {
  updateWantedRows(queryClient, (rows) =>
    rows.map((row) =>
      row.matches.some((match) => match.id === matchId)
        ? {
            ...row,
            matches: row.matches.map((match) =>
              match.id === matchId ? { ...match, ...patch } : match,
            ),
          }
        : row,
    ),
  );
}

/** 한 손님의 줄만 다시 받아 갈아 끼운다. 캐시를 고치는 규칙은 `wanted-row-cache.ts`에 있다. */
export function refreshWantedRow(queryClient: QueryClient, requirementId: string) {
  return refreshWantedRowWith(queryClient, requirementId, async (filter, id) => {
    const result = await api.buyerRequirements.findAllWithMatches({ ...filter, ids: id, limit: 1 });
    return result.items[0];
  });
}
