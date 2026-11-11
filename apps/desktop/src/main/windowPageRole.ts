import {
  isTabBarDocumentUrl,
  isTrustedDocumentUrl,
  type RendererLocation,
  type WindowPageKind,
} from './rendererDocuments';

/**
 * 창 자체의 화면이 지금 어떤 문서인지(역할)를 정하는 규칙. Electron에 의존하지 않는다.
 *
 * 역할은 문서가 실제로 들어선 순간(문서가 바뀌는 main frame 이동)에 한 번 정해 창에
 * 기록해 두고, 그 뒤의 요청은 기록된 역할로 가린다. 문서가 떠 있는 동안의 주소로 다시
 * 정하지 않는다: 문서는 `history.pushState`로 자기 주소를 바꿀 수 있어서, 주소만 보면
 * 탭바 문서가 로그인 화면으로 보일 수 있다.
 */
export type WindowPageRole = WindowPageKind | null;

/**
 * 창의 화면에 들어선 문서의 역할. 앱이 내주는 문서가 아니거나 오류 응답(404 등)이면
 * 역할이 없다(아무 통로도 쓸 수 없다).
 */
export function windowPageRoleOfDocument(
  location: RendererLocation,
  committedUrl: string,
  httpResponseCode = 200,
): WindowPageRole {
  // 파일·전용 주소가 아닌 응답에는 코드가 없다(-1). 400 이상만 오류로 본다.
  if (httpResponseCode >= 400) return null;
  if (!isTrustedDocumentUrl(location, committedUrl)) return null;
  return isTabBarDocumentUrl(location, committedUrl) ? 'tab-bar' : 'gate';
}

/**
 * 창의 화면이 스스로 시작한 문서 이동(링크, `location.href`, 다시 불러오기)을 허용할지.
 * 문서를 바꾸는 것은 main만 한다(로그인 세션이 시작되고 끝날 때). 문서 스스로는 지금
 * 문서를 다시 불러오는 것, 곧 같은 역할의 문서로 가는 것만 할 수 있다. main이 다른
 * 문서를 불러오는 중이면 그것도 막는다(main의 로드를 밀어내지 않게).
 */
export function allowsWindowPageNavigation(
  location: RendererLocation,
  page: { requested: WindowPageRole; committed: WindowPageRole },
  targetUrl: string,
): boolean {
  if (page.committed === null || page.requested !== page.committed) return false;
  return windowPageRoleOfDocument(location, targetUrl) === page.committed;
}

/**
 * 들어선 문서가 main이 불러오라고 한 문서가 아닌지. main이 시작한 로드가 아직 진행
 * 중이면 곧 바뀔 것이므로 어긋난 것으로 보지 않는다.
 */
export function windowPageNeedsRecovery(page: {
  requested: WindowPageRole;
  committed: WindowPageRole;
  loading: boolean;
}): boolean {
  if (page.requested === null || page.loading) return false;
  return page.committed !== page.requested;
}

/**
 * 앱 전체에 알리는 상태(로그인 세션, 실시간 이벤트, 통화, 업데이트)를 창의 화면에도
 * 보낼지. 로그인 전 화면만 받는다. 탭바 문서는 탭바 상태만 받고, 세션(사용자 정보)이나
 * 업무 이벤트는 받지 않는다.
 */
export function windowPageReceivesAppBroadcasts(role: WindowPageRole): boolean {
  return role === 'gate';
}

/** 창의 화면을 다시 불러오는 시도 사이의 간격. 이만큼 해도 안 되면 그만둔다. */
export const WINDOW_PAGE_RETRY_DELAYS_MS = [300, 1_500, 5_000] as const;
/** 마지막 실패 뒤 이만큼 탈 없이 지났으면 다시 처음부터 센다. */
export const WINDOW_PAGE_RETRY_RESET_MS = 60_000;

export interface WindowPageRecoveryState {
  attempts: number;
  lastFailureAt: number | null;
}

export const NO_WINDOW_PAGE_FAILURES: WindowPageRecoveryState = {
  attempts: 0,
  lastFailureAt: null,
};

/**
 * 창의 화면을 불러오지 못했거나 화면이 죽었을 때 다시 불러올지와 그 간격. 연달아
 * 실패하면 횟수를 다 쓰고 그만둔다(null). 끝없이 다시 불러오며 깜빡이지 않게 한다.
 */
export function planWindowPageRecovery(
  state: WindowPageRecoveryState,
  now: number,
): { delayMs: number; next: WindowPageRecoveryState } | null {
  const fresh =
    state.lastFailureAt !== null && now - state.lastFailureAt > WINDOW_PAGE_RETRY_RESET_MS;
  const attempts = fresh ? 0 : state.attempts;
  const delayMs = WINDOW_PAGE_RETRY_DELAYS_MS[attempts];
  if (delayMs === undefined) return null;
  return { delayMs, next: { attempts: attempts + 1, lastFailureAt: now } };
}
