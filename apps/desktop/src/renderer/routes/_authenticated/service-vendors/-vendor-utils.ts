import { ApiError } from '@estate-erp/api-client';
import type { VendorAdTier, VendorBusinessType } from '@estate-erp/api-client';

/** 광고 티어 뱃지 메타 (목록/상세 공용). */
export const AD_TIER_META: Record<VendorAdTier, { label: string; className: string }> = {
  premium: {
    label: 'PREMIUM',
    className: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
  },
  basic: {
    label: '광고',
    className: 'bg-blue-500 text-white',
  },
  none: { label: '', className: '' },
};

export const BUSINESS_TYPE_LABEL: Record<VendorBusinessType, string> = {
  individual: '개인 (무등록)',
  sole_proprietor: '개인사업자',
  corporate: '법인',
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청을 처리하지 못했습니다';
}
