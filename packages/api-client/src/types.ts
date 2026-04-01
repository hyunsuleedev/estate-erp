/** API 클라이언트 설정 */
export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
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
