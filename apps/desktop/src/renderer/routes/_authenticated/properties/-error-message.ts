import { ApiError } from '@estate-erp/api-client';
import { apiErrorMessage, isNetworkError } from '@/lib/api-error';

/**
 * 매물 화면의 오류 문구. 서버·네트워크 오류는 공용 규칙(apiErrorMessage)으로 고르고,
 * 화면이 저장 전에 직접 던진 확인 문구("매매가를 입력하세요." 같은 한국어)는 그대로 보인다.
 * 영어 문구("Failed to fetch", 검사 메시지)는 fallback으로 바꾼다.
 */
export function propertyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || isNetworkError(error)) return apiErrorMessage(error, fallback);
  if (error instanceof Error && /[가-힣]/.test(error.message)) return error.message;
  return fallback;
}
