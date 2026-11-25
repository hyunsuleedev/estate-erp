import {
  ApiError,
  ApiNetworkError,
  API_NETWORK_ERROR_MESSAGE,
} from '@estate-erp/api-client';

import { translateServerMessage } from '../i18n/auto';

/** 서버에 닿지 못했을 때(네트워크 끊김·서버 꺼짐) 보이는 한 줄. 문구는 api-client 한 곳에 있다. */
export const NETWORK_ERROR_MESSAGE = API_NETWORK_ERROR_MESSAGE;

/**
 * 토스트·오류 줄에 보일 문구를 고른다. 화면마다 `error.message`를 그대로 내면
 * "API Error 400"·"Failed to fetch"·영어 검사 문구가 중개사에게 보인다.
 *
 * - 서버가 사람용 문구를 줬으면(ApiError.serverMessage) 그것.
 * - 5xx는 서버가 한국어로 일부러 적은 안내만 쓴다(예: 직원 계정의 "로그인 서버에 연결하지 못했습니다…",
 *   "비밀번호는 바뀌었지만…"). 프레임워크 기본 문구("Internal server error")는 `fallback`으로 바꾼다.
 * - 서버에 닿지 못했으면(ApiNetworkError, 또는 fetch의 TypeError) "서버에 연결하지 못했습니다…".
 * - 그 밖에는 `fallback` ("…하지 못했습니다. 다시 시도해 주세요."처럼 무엇이 안 됐는지 말하는 문구).
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const message = error.serverMessage;
    if (!message) return fallback;
    if (error.statusCode >= 500 && !/[가-힣]/.test(message)) return fallback;
    // 서버는 한글 문구만 준다. 영어 화면에서는 사전으로 바꿔 보여 준다(없으면 한글 그대로).
    return translateServerMessage(message);
  }
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  return fallback;
}

/** 서버에 닿지 못한 오류인가. api-client가 감싼 ApiNetworkError를 먼저 보고, 감싸지 않은 fetch 오류도 알아본다. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiNetworkError) return true;
  if (!(error instanceof TypeError)) return false;
  return /failed to fetch|load failed|networkerror|network request failed/i.test(error.message);
}
