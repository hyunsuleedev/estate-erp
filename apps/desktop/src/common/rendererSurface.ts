export const RENDERER_SURFACE_ARGUMENT = '--estate-renderer-surface=';
export const RENDERER_TAB_ID_ARGUMENT = '--estate-tab-id=';

export type RendererSurfaceInfo =
  | { kind: 'window-shell'; tabId: null }
  | { kind: 'native-tab'; tabId: string }
  /** 탭 화면 위에 뜨는 전화 수신 팝업 층. 창마다 하나다. */
  | { kind: 'call-overlay'; tabId: null }
  /** 로그인 뒤의 창 화면: 탭바만 그리는 문서. main이 window-shell로 정해 준 창의 문서다. */
  | { kind: 'tab-bar'; tabId: null };

function windowShellSurface(): RendererSurfaceInfo {
  return { kind: 'window-shell', tabId: null };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 화면 쪽에서 자기 역할을 읽을 때 쓴다(preload가 내준 값, 또는 브라우저 단독 실행의
 * URL 값). 여기서의 역할은 무엇을 그릴지만 정한다. 무엇을 할 수 있는지는 preload가
 * 내준 통로와 main의 보낸 쪽 확인이 정하므로, 모르는 값은 창의 화면으로 그린다.
 * native-tab에는 반드시 main이 발급한 tabId가 함께 있어야 한다.
 */
export function normalizeRendererSurface(value: unknown): RendererSurfaceInfo {
  if (!value || typeof value !== 'object') return windowShellSurface();

  const candidate = value as { kind?: unknown; tabId?: unknown };
  if (candidate.kind === 'call-overlay') {
    return { kind: 'call-overlay', tabId: null };
  }
  if (candidate.kind === 'tab-bar') {
    return { kind: 'tab-bar', tabId: null };
  }
  if (candidate.kind !== 'native-tab' || !nonEmptyString(candidate.tabId)) {
    return windowShellSurface();
  }

  return { kind: 'native-tab', tabId: candidate.tabId };
}

/**
 * main이 화면을 만들 때 additionalArguments로 정해 준 역할을 읽는다. 역할이 없거나
 * 모르는 값이면 null이다: 그런 문서에는 preload가 아무 통로도 내주지 않는다. 가장 많은
 * 것을 할 수 있는 창의 화면(window-shell)도 main이 그렇게 정해 줬을 때만 된다.
 */
export function parseRendererSurfaceArguments(
  argv: readonly string[],
): RendererSurfaceInfo | null {
  const kind = argv
    .find((argument) => argument.startsWith(RENDERER_SURFACE_ARGUMENT))
    ?.slice(RENDERER_SURFACE_ARGUMENT.length);
  const tabId = argv
    .find((argument) => argument.startsWith(RENDERER_TAB_ID_ARGUMENT))
    ?.slice(RENDERER_TAB_ID_ARGUMENT.length);

  if (kind === 'window-shell') return windowShellSurface();
  if (kind === 'call-overlay') return { kind: 'call-overlay', tabId: null };
  if (kind === 'native-tab' && nonEmptyString(tabId)) {
    return { kind: 'native-tab', tabId };
  }
  return null;
}
