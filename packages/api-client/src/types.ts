type MaybePromise<T> = T | Promise<T>;

export interface AuthFailureContext {
  /** True only when the rejected request actually carried a Bearer token. */
  hadBearer: boolean;
}

/** API 클라이언트 설정 */
export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => MaybePromise<string | null>;
  /** 인증 실패 시 호스트 앱은 여기서 로그아웃 + 라우팅 처리. */
  onAuthFailure?: (context: AuthFailureContext) => void;
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
