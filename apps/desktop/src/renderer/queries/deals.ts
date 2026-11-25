import { queryOptions } from '@tanstack/react-query';
import type { DealListFilter } from '@estate-erp/api-client';

import { api } from '@/lib/api';

/**
 * 거래 조회는 여기서만 정의한다. 화면이 키를 손으로 적으면 같은 요청이 다른 키로 따로 저장되고
 * (거래 상세가 'detail'과 'project-step' 두 이름으로 있었다), 무엇을 다시 받아야 하는지도 화면마다 달라진다.
 *
 * 키는 넓은 것에서 좁은 것으로 쌓는다: ['deals'] → ['deals', 'list', 조건] · ['deals', 'detail', id].
 * 조건이 다르면 키도 다르다 — 전체를 받아 화면에서 거르는 것을 "캐시 공유"라고 부르지 않는다.
 */
export const dealQueries = {
  all: ['deals'] as const,

  /** 거래 목록(가벼운 줄). 조건 없이 부르면 사무소의 모든 거래다 */
  list: (filter: DealListFilter = {}) =>
    queryOptions({
      queryKey: ['deals', 'list', filter] as const,
      queryFn: () => api.deals.findAll(filter),
    }),

  /** 진행 중인 거래 (거래관리) */
  active: () =>
    queryOptions({
      queryKey: ['deals', 'active'] as const,
      queryFn: () => api.deals.findActive(),
    }),

  /** 거래 한 건의 상세: 수수료 청구 · 배분 · 연락처 상세까지. id가 아직 없으면 enabled로 막아 쓴다 */
  detail: (id: string | null | undefined) =>
    queryOptions({
      queryKey: ['deals', 'detail', id] as const,
      queryFn: () => api.deals.findOne(id as string),
    }),

  /** 공동중개 거래와 수수료 청구 · 배분 (공동중개 정산) */
  jointWithCommissions: () =>
    queryOptions({
      queryKey: ['deals', 'joint-commissions'] as const,
      queryFn: () => api.deals.findJointWithCommissions(),
    }),

  /** 파트너 중개사가 연결된 거래와 수수료 청구 · 배분 (파트너 중개사) */
  partnerWithCommissions: () =>
    queryOptions({
      queryKey: ['deals', 'partner-commissions'] as const,
      queryFn: () => api.deals.findPartnerWithCommissions(),
    }),
};

/**
 * 거래가 바뀌었을 때 다시 받을 것. 내가 바꾼 직후(저장 응답)와 남이 바꿨다는 실시간 신호가 같은 함수를 부른다.
 *
 * 거래만이 아니다: 집 상세와 의뢰 상세에는 그 집의 거래 요약이 실려 있고, 매물 목록의 "거래 중" 표시와
 * 매칭의 "거래 전환" 단계도 거래에서 나온다. 범위를 넓게 잡아도 실제로 다시 요청되는 것은 지금 떠 있는 화면뿐이다.
 */
/** 다시 받게 하는 쪽: 화면의 queryClient(다른 탭에도 알린다)이거나, 실시간 신호를 받은 쪽(이 화면만) */
interface Invalidator {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => unknown;
}

export function invalidateDealData(queryClient: Invalidator): void {
  void queryClient.invalidateQueries({ queryKey: dealQueries.all });
  void queryClient.invalidateQueries({ queryKey: ['properties'] });
  void queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
  void queryClient.invalidateQueries({ queryKey: ['listings'] });
  void queryClient.invalidateQueries({ queryKey: ['matches'] });
}
