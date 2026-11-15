/** 서버가 한 번에 주는 최대 건수(listing-advertisements 목록 limit 상한). */
export const MY_ADS_PAGE_LIMIT = 100;
/** 한꺼번에 받는 페이지 상한. 100건 × 50쪽 = 5,000건에서 멈추고 잘렸다고 알린다. */
export const MY_ADS_MAX_PAGES = 50;
/** 동시에 보내는 페이지 요청 수. */
const MY_ADS_PAGE_CONCURRENCY = 4;

type PageResult<T> = {
  items: T[];
  pagination: { total: number; totalPages?: number; limit?: number };
};

export type LoadedMyAdvertisements<T> = {
  items: T[];
  /** 서버가 알려 준 전체 건수 */
  total: number;
  /** 페이지 상한에 걸려 뒤쪽을 받지 않았다 */
  truncated: boolean;
};

/**
 * 첫 쪽에서 전체 건수를 알아낸 뒤 나머지 쪽을 몇 개씩 묶어 받는다.
 * 받는 도중 순서가 밀려 같은 광고가 두 번 오면 처음 것만 남긴다.
 * 한 쪽이라도 실패하면 전체를 실패로 돌려 반쪽 목록을 완전한 것처럼 보이지 않게 한다.
 */
export async function loadAllAdvertisementPages<T extends { id: string }>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  {
    maxPages = MY_ADS_MAX_PAGES,
    concurrency = MY_ADS_PAGE_CONCURRENCY,
    pageLimit = MY_ADS_PAGE_LIMIT,
  }: { maxPages?: number; concurrency?: number; pageLimit?: number } = {},
): Promise<LoadedMyAdvertisements<T>> {
  const first = await fetchPage(1);
  const total = Math.max(0, first.pagination.total);
  const limit = Math.max(1, first.pagination.limit ?? pageLimit);
  const totalPages = Math.max(
    1,
    first.pagination.totalPages ?? Math.ceil(total / limit),
  );
  const lastPage = Math.min(totalPages, Math.max(1, maxPages));
  const pages: PageResult<T>[] = [first];
  const batchSize = Math.max(1, concurrency);

  for (let start = 2; start <= lastPage; start += batchSize) {
    const batch: Promise<PageResult<T>>[] = [];
    for (let page = start; page < start + batchSize && page <= lastPage; page += 1) {
      batch.push(fetchPage(page));
    }
    pages.push(...(await Promise.all(batch)));
  }

  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }

  return {
    items,
    total: Math.max(total, items.length),
    truncated: totalPages > lastPage,
  };
}
