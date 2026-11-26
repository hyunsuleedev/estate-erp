import type { QueryClient } from '@tanstack/react-query';
import { buyerRequirementQueries, refreshRequirementRow } from './buyer-requirements';

/** 다시 받게 하는 쪽: 화면의 queryClient(다른 탭에도 알린다)이거나, 실시간 신호를 받은 쪽(이 화면만) */
interface Invalidator {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => unknown;
}

/**
 * 매칭이 바뀌었을 때 다시 받을 것. 매칭을 만들고 · 단계를 옮기고 · 메모를 고치고 · 지운 뒤에 부른다.
 *
 * 매칭 목록만이 아니다: 희망매물 목록은 손님 줄 안에 그 손님의 매칭을 실어 받으므로 함께 다시 받는다.
 * 어느 손님의 매칭인지 모를 때(여러 건이 한꺼번에 바뀌었을 때) 쓴다 — 알면 `refreshMatchData`.
 * 실제로 다시 요청되는 것은 지금 떠 있는 화면뿐이다.
 */
export function invalidateMatchData(queryClient: Invalidator): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['matches'] }),
    queryClient.invalidateQueries({ queryKey: buyerRequirementQueries.withMatchesAll }),
  ]);
}

/**
 * 한 손님의 매칭 하나가 바뀌었을 때. 내가 저장한 직후와 `match.updated` 신호가 같은 함수를 부른다.
 *
 * 매칭 목록들(매물 쪽 패널 · 상세)은 작아서 다시 받고, 희망매물 목록은 **그 손님 한 줄만** 다시 받아 갈아 끼운다.
 * 매칭 하나 때문에 받아 둔 손님 목록 전체를 다시 받지 않는다.
 * 다른 탭에는 퍼뜨리지 않는다: 탭마다 같은 실시간 신호를 직접 받는다.
 */
export function refreshMatchData(
  queryClient: QueryClient,
  invalidator: Invalidator,
  buyerReqId: string,
): Promise<unknown> {
  return Promise.all([
    invalidator.invalidateQueries({ queryKey: ['matches'] }),
    refreshRequirementRow(queryClient, buyerReqId),
  ]);
}
