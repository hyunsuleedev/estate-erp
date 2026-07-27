import type { QueryClient } from '@tanstack/react-query';

/**
 * 의뢰 확인 상태·Deal 단계 변경이 파생 상태를 바꾸는 캐시 목록.
 *
 * 상태 SSOT 재설계 이후 "거래중/종료" 와 "현재 매물(열린 의뢰만)" 은 조회 시
 * 파생되므로, intake 상태 전이나 Deal 단계 변경 하나가 매물 목록·매물 시트·
 * 단지 호실 그리드·호실 상세·네트워크 노출까지 한꺼번에 바꾼다.
 * 해당 뮤테이션은 반드시 이 헬퍼로 무효화할 것 — 개별 키 나열 금지.
 */
const LISTING_DERIVED_QUERY_KEYS = [
  ['listings'],
  ['listing-intakes'],
  ['properties'],
  ['sites'],
  ['site-detail'],
  ['office-sites'],
  ['units'],
  ['network'],
  ['dashboard'],
  ['matches'],
  ['buyer-requirements'],
  ['consultations'],
  ['consultation'],
  ['calendar-events'],
  ['tasks'],
  ['deals'],
  ['deal'],
  ['office-ad-groups'],
  ['contacts'],
  ['employees'],
  ['employee'],
  ['global-search'],
  ['calendar-event-link-search'],
  ['deal-create-listings'],
  ['consultation-form-listings'],
  ['consultation-form-intakes'],
  ['consultation-filter-units'],
] as const;

export function invalidateListingDerivedCaches(queryClient: QueryClient) {
  for (const key of LISTING_DERIVED_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...key] });
  }
}
