/** API 클라이언트 설정 */
export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
  /** 저장된 refresh token (Supabase) — 401 발생 시 access token 재발급에 사용 */
  getRefreshToken?: () => string | null;
  /** Refresh 성공 시 호출. Supabase는 refresh token도 회전시키므로 둘 다 저장해야 함. */
  setTokens?: (accessToken: string, refreshToken: string) => void;
  /** Refresh 자체가 실패한 경우 (refresh token 만료/폐기). 호스트 앱은 여기서 로그아웃 + 라우팅 처리. */
  onAuthFailure?: () => void;
}

/** 페이지네이션 응답 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** API 에러 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public body: unknown,
  ) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : `API Error ${statusCode}`;

    super(message);
    this.name = 'ApiError';
  }
}
