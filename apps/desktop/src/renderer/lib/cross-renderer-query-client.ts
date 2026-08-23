import {
  QueryClient,
  type InvalidateOptions,
  type InvalidateQueryFilters,
  type QueryClientConfig,
  type QueryKey,
} from '@tanstack/react-query';

export type QueryInvalidationBroadcaster = (
  queryKey: readonly unknown[],
) => void;

function isJsonValue(
  value: unknown,
  seen = new Set<object>(),
  budget = { nodes: 0 },
  depth = 0,
): boolean {
  budget.nodes += 1;
  if (budget.nodes > 10_000 || depth > 20) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }

  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen, budget, depth + 1))
    : Object.values(value).every((item) =>
        isJsonValue(item, seen, budget, depth + 1),
      );
  seen.delete(value);
  return valid;
}

/**
 * IPC가 안전하게 전달할 수 있고, 빈 배열처럼 전체 캐시를 뜻하지 않는 query key만
 * renderer 사이에 공유한다. main process의 payload 한도와도 동일하게 맞춘다.
 */
export function isBroadcastableQueryKey(
  queryKey: unknown,
): queryKey is readonly unknown[] {
  return (
    Array.isArray(queryKey) &&
    queryKey.length > 0 &&
    queryKey.length <= 32 &&
    isJsonValue(queryKey)
  );
}

function getTransferableQueryKey(
  filters: InvalidateQueryFilters | undefined,
): readonly unknown[] | null {
  if (!filters || !isBroadcastableQueryKey(filters.queryKey)) return null;

  // predicate/exact/type 등의 조건을 queryKey 하나로 축약하면 원격 renderer에서
  // 더 넓은 캐시가 무효화될 수 있다. 현재 앱의 mutation 호출처럼 queryKey만 있는
  // 경우에 한해 동일한 prefix-match 의미를 그대로 전달한다.
  if (Object.keys(filters).some((key) => key !== 'queryKey')) return null;
  return filters.queryKey;
}

/**
 * QueryClient의 기존 호출부를 그대로 유지하면서 명시적인 queryKey 무효화만
 * 다른 Electron renderer로 승격한다.
 */
export class CrossRendererQueryClient extends QueryClient {
  constructor(
    config: QueryClientConfig,
    private readonly broadcastInvalidation?: QueryInvalidationBroadcaster,
  ) {
    super(config);
  }

  override invalidateQueries<TTaggedQueryKey extends QueryKey = QueryKey>(
    filters?: InvalidateQueryFilters<TTaggedQueryKey>,
    options?: InvalidateOptions,
  ): Promise<void> {
    const result = super.invalidateQueries(filters, options);
    const queryKey =
      options === undefined ? getTransferableQueryKey(filters) : null;
    if (!queryKey || !this.broadcastInvalidation) return result;

    try {
      this.broadcastInvalidation(queryKey);
    } catch {
      // IPC 장애가 현재 renderer의 정상적인 cache invalidation을 깨면 안 된다.
    }
    return result;
  }

  /** main에서 받은 이벤트는 super에 직접 적용해 다시 IPC로 보내지 않는다. */
  invalidateQueriesFromRemote(queryKey: readonly unknown[]): Promise<void> {
    if (!isBroadcastableQueryKey(queryKey)) return Promise.resolve();
    return super.invalidateQueries({ queryKey });
  }
}
