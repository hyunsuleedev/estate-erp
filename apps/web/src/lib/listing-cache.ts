import type { QueryClient } from "@tanstack/react-query";

/**
 * 의뢰 확인 상태·Deal 단계 변경이 파생 상태를 바꾸는 캐시 목록.
 *
 * 상태 SSOT 재설계 이후 "거래중/종료" 와 "현재 매물(열린 의뢰만)" 은 조회 시
 * 파생되므로, intake 상태 전이나 Deal 단계 변경 하나가 매물 목록·매물 시트·
 * 단지 호실 그리드·호실 상세·네트워크 노출까지 한꺼번에 바꾼다.
 * 해당 뮤테이션은 반드시 이 헬퍼로 무효화할 것 — 개별 키 나열 금지.
 */
const LISTING_DERIVED_QUERY_KEYS = [
  // 매물/의뢰 본체
  ["listings"],
  ["listing-intakes"],
  ["properties"],
  // 단지·호실 그리드 (열린 의뢰만 "매물 있음")
  ["sites"],
  ["site-detail"],
  ["office-sites"],
  ["units"],
  // 네트워크 노출 (파생 where)
  ["network"],
  // 매물 상태 뱃지를 표시하는 화면들
  ["dashboard"],
  ["matches"],
  ["buyer-requirements"],
  ["consultations"],
  ["consultation"],
  ["calendar-events"],
  ["tasks"],
  ["deals"],
  ["deal"],
  ["office-ad-groups"],
  // 연락처/직원 상세의 상담 카드가 매물 확인 상태를 표시
  // (직원 상세 peek 은 단수 키 ['employee', id] 를 쓴다 — 둘 다 필요)
  ["contacts"],
  ["employees"],
  ["employee"],
  // 매물/의뢰를 조회하는 검색·피커류 (열린 의뢰 기본 필터 적용 대상)
  ["global-search"],
  ["calendar-event-link-search"],
  ["deal-create-listings"],
  ["consultation-form-listings"],
  ["consultation-form-intakes"],
  ["consultation-filter-units"],
] as const;
// 제외 판정 근거 (재검토 시 참고):
// - contracts/contract: 계약 payload 의 listing 은 주소 체인만 사용, 상태 미표시
// - inbox/proposals: 제안 스냅샷(proposedChanges)이라 라이브 파생 아님
// - external-listing-groups: 외부(광고노트) 매물 — intake 체계와 무관
// - consultation-filter-sites/dongs: 단지·동 이름만 — listing payload 없음

export function invalidateListingDerivedCaches(queryClient: QueryClient) {
  for (const key of LISTING_DERIVED_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...key] });
  }
}
