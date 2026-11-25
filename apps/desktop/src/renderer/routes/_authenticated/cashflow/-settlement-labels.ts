import { formatPlaceLabel } from '@estate-erp/shared';
import type { DealListItem as Deal } from '@estate-erp/api-client';

/** 정산 화면에서 쓰는 직원 역할 표기 */
export const PARTICIPANT_ROLE_LABEL: Record<string, string> = {
  listing_agent: '매도측',
  buying_agent: '매수측',
  dual_agent: '단독중개',
  manager: '관리',
  assistant: '보조',
  closer: '마감',
};

/** 거래 목록 응답의 property에서 "고덕그라시움 102동 2203호"를 만든다 (STANDARDS 주소·호수, formatPlaceLabel) */
export function dealLocationOf(deal: Deal): string {
  const unit = deal.property?.unit as
    | {
        name?: string | null;
        floor?: number | null;
        floorEnd?: number | null;
        floorLabel?: string | null;
        dong?: { name?: string | null; isPlaceholder?: boolean | null } | null;
      }
    | null
    | undefined;
  return (
    formatPlaceLabel({
      siteName: deal.property?.site?.name ?? null,
      dongName: unit?.dong?.name ?? null,
      dongIsPlaceholder: unit?.dong?.isPlaceholder ?? null,
      unit: unit ?? null,
    }) || '매물 미지정'
  );
}
