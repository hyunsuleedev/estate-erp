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
import { refreshRequirementRowWith } from './requirement-row-cache';

/** 희망매물 목록이 한 번에 받는 손님 수. 아래로 굴리면 다음 쪽을 이어 받는다. */
export const REQUIREMENT_PAGE_SIZE = 50;

/** 희망매물 목록의 조건. 쪽 번호와 쪽 크기는 조회가 정한다. */
export type RequirementListFilter = Omit<BuyerRequirementsFilter, 'page' | 'limit'>;

/**
 * 구매 희망조건의 조회 정의. 조회 키는 이 파일에서만 정한다.
 * 키는 "어느 화면이 쓰는가"가 아니라 "무슨 데이터인가"로 짓는다.
 * `withMatches`의 줄은 `{ 손님 조건, 그 손님의 매칭들 }`이다 — 매칭을 따로 받아 화면에서 묶지 않는다.
 */
export const buyerRequirementQueries = {
  all: ['buyer-requirements'] as const,

  /**
   * 손님 조건만 (매칭은 개수만). 손님을 고르는 자리 — 고객 연결 · 매칭 생성 · 상담 기록 — 가 쓴다.
   * 키는 화면 이름이 아니라 조건이다: 같은 조건으로 묻는 화면들은 받아 둔 것을 함께 쓴다.
   */
  list: (filter: BuyerRequirementsFilter) =>
    queryOptions({
      queryKey: ['buyer-requirements', 'list', filter] as const,
      queryFn: () => api.buyerRequirements.findAll(filter),
    }),

  /** 손님 조건 한 건 (그 조건의 매칭 · 최근 상담 포함) */
  detail: (id: string | null | undefined) =>
    queryOptions({
      queryKey: ['buyer-requirements', 'detail', id] as const,
      queryFn: () => api.buyerRequirements.findOne(id as string),
    }),

  /** 매칭을 실어 받은 것 전부 (목록들과 한 줄). 매칭이 바뀌면 이 묶음이 낡는다. */
  withMatchesAll: ['buyer-requirements', 'with-matches'] as const,

  /** 손님 조건 + 그 손님의 매칭들 (희망매물 목록): 조건 · 검색 · 정렬은 서버가 하고, 쪽 단위로 이어 받는다 */
  withMatches: (filter: RequirementListFilter) =>
    infiniteQueryOptions({
      queryKey: ['buyer-requirements', 'with-matches', 'list', filter] as const,
      initialPageParam: 1,
      queryFn: ({ pageParam }) =>
        api.buyerRequirements.findAllWithMatches({
          ...filter,
          sortBy: 'name',
          page: pageParam,
          limit: REQUIREMENT_PAGE_SIZE,
        }),
      getNextPageParam: (lastPage) =>
        lastPage.pagination.page < lastPage.pagination.totalPages
          ? lastPage.pagination.page + 1
          : undefined,
    }),

  /** 목록의 줄과 같은 꼴로 받는 한 줄. 조건에 걸리지 않아도(상태 · 필터) 받는다. */
  withMatchesRow: (id: string | null) =>
    queryOptions({
      queryKey: ['buyer-requirements', 'with-matches', 'row', id] as const,
      queryFn: async () => {
        const result = await api.buyerRequirements.findAllWithMatches({
          ids: id as string,
          limit: 1,
        });
        return result.items[0] ?? null;
      },
    }),

  /**
   * 필터의 선택지 (지금 조건들에 실제로 있는 지역 · 단지 · 담당자).
   * 매칭과 상관없는 데이터라 매칭 묶음 밖에 둔다 — 매칭이 바뀌어도 낡지 않는다.
   */
  filterOptions: (status: string) =>
    queryOptions({
      queryKey: ['buyer-requirements', 'filter-options', status] as const,
      queryFn: () => api.buyerRequirements.filterOptions(status),
    }),
};

type RequirementPage = PaginatedResponse<BuyerRequirementWithMatches>;
type RequirementListData = InfiniteData<RequirementPage, number>;

/** 받아 둔 쪽들을 한 목록으로. 쪽을 받는 사이 줄이 옮겨 가 두 쪽에 걸쳐 온 것은 한 번만 싣는다. */
export function mergeRequirementPages(pages: RequirementPage[] | undefined): BuyerRequirementWithMatches[] {
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
export function updateRequirementRows(
  queryClient: QueryClient,
  update: (rows: BuyerRequirementWithMatches[]) => BuyerRequirementWithMatches[] | undefined,
): void {
  queryClient.setQueriesData<RequirementListData>(
    { queryKey: ['buyer-requirements', 'with-matches', 'list'] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({ ...page, items: update(page.items) ?? page.items })),
      },
  );
  queryClient.setQueriesData<BuyerRequirementWithMatches | null>(
    { queryKey: ['buyer-requirements', 'with-matches', 'row'] },
    (row) => (row ? (update([row])?.[0] ?? row) : row),
  );
}

/** 받아 둔 줄 가운데 이 조건의 가장 새 값 */
export function findRequirementRow(
  queryClient: QueryClient,
  id: string,
): BuyerRequirementWithMatches | undefined {
  let found: BuyerRequirementWithMatches | undefined;
  const consider = (row: BuyerRequirementWithMatches | null | undefined) => {
    if (row && row.id === id && (!found || row.updatedAt > found.updatedAt)) found = row;
  };
  for (const [, data] of queryClient.getQueriesData<RequirementListData>({
    queryKey: ['buyer-requirements', 'with-matches', 'list'],
  })) {
    for (const page of data?.pages ?? []) page.items.forEach(consider);
  }
  for (const [, row] of queryClient.getQueriesData<BuyerRequirementWithMatches | null>({
    queryKey: ['buyer-requirements', 'with-matches', 'row'],
  })) {
    consider(row);
  }
  return found;
}

/** 받아 둔 줄 안의 매칭 하나를 고친 칸만 덮는다 (메모 · 합의 조건을 저장한 직후) */
export function patchRequirementMatch(
  queryClient: QueryClient,
  matchId: string,
  patch: Partial<MatchRow>,
): void {
  updateRequirementRows(queryClient, (rows) =>
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

/** 한 손님의 줄만 다시 받아 갈아 끼운다. 캐시를 고치는 규칙은 `requirement-row-cache.ts`에 있다. */
export function refreshRequirementRow(queryClient: QueryClient, requirementId: string) {
  return refreshRequirementRowWith(queryClient, requirementId, async (filter, id) => {
    const result = await api.buyerRequirements.findAllWithMatches({ ...filter, ids: id, limit: 1 });
    return result.items[0];
  });
}
