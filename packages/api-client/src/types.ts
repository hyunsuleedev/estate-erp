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

/**
 * 서버가 응답에 담아 준 안내 문구를 꺼낸다. 없으면 null.
 *
 * - 서비스가 던진 오류는 `message`가 글 한 줄이다.
 * - 입력 검사(ValidationPipe)에 걸리면 `message`가 글 여러 줄(배열)이다. 한글 안내를 달아 둔 것만
 *   사람에게 보여 준다. 검사 도구가 만든 영어 문구("price must be a number")는 화면에 내지 않는다 —
 *   그때는 null이라 부르는 쪽의 기본 문구가 나온다.
 */
function readServerMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return null;
  }
  const { message } = body as { message: unknown };
  if (typeof message === 'string') return message || null;
  if (Array.isArray(message)) {
    const lines = message.filter(
      (line): line is string =>
        typeof line === 'string' && /[가-힣]/.test(line),
    );
    return lines.length > 0 ? [...new Set(lines)].join(' ') : null;
  }
  return null;
}

/** API 에러 */
export class ApiError extends Error {
  /** 서버가 사람에게 보여 주라고 준 문구. 없으면 null(이때 `message`는 "API Error <상태>"). */
  public readonly serverMessage: string | null;

  constructor(
    public statusCode: number,
    public body: unknown,
  ) {
    const serverMessage = readServerMessage(body);
    super(serverMessage ?? `API Error ${statusCode}`);
    this.name = 'ApiError';
    this.serverMessage = serverMessage;
  }
}

/** 서버에 닿지 못했을 때 화면에 보일 한 줄 */
export const API_NETWORK_ERROR_MESSAGE =
  '서버에 연결하지 못했습니다. 잠시 뒤 다시 해 주세요.';

/**
 * 서버에 닿지 못했다(네트워크 끊김·서버 꺼짐). fetch가 던지는 TypeError의 문구는
 * 브라우저마다 다른 영어("Failed to fetch", "Load failed")라 화면에 그대로 내면 안 된다.
 * TypeError를 물려받아, 예전처럼 `instanceof TypeError`로 가려내는 코드도 그대로 동작한다.
 */
export class ApiNetworkError extends TypeError {
  constructor(public readonly original?: unknown) {
    super(API_NETWORK_ERROR_MESSAGE);
    this.name = 'ApiNetworkError';
  }
}
