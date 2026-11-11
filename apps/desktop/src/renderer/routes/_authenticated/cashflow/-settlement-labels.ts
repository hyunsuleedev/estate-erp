import type { Deal } from '@estate-erp/api-client';
import { dealLocation } from './-cashflow-utils';

/** 정산 화면에서 쓰는 직원 역할 표기 */
export const PARTICIPANT_ROLE_LABEL: Record<string, string> = {
  listing_agent: '매도측',
  buying_agent: '매수측',
  dual_agent: '단독중개',
  manager: '관리',
  assistant: '보조',
  closer: '마감',
};

/** 거래 목록 응답의 property에서 단지·동·호를 읽는다 */
export function dealLocationOf(deal: Deal): string {
  const unit = deal.property?.unit as
    | { name?: string | null; dong?: { name?: string | null } | null }
    | null
    | undefined;
  return dealLocation({
    siteName: deal.property?.site?.name ?? null,
    dongName: unit?.dong?.name ?? null,
    unitName: unit?.name ?? null,
  });
}
