/**
 * 매물(거래 조건) 지우기는 대표·매니저만 — 서버(listings/listing-input.ts)와 같은 기준.
 * 권한 없는 직원에게는 삭제 메뉴를 보이지 않는다. 끝난 거래는 지우지 않고 의뢰 종료로 남긴다.
 */
export function canDeleteListing(role?: string | null) {
  return role === 'owner' || role === 'manager';
}
