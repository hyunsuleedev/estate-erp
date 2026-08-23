export const RENDERER_SURFACE_ARGUMENT = '--estate-renderer-surface=';
export const RENDERER_TAB_ID_ARGUMENT = '--estate-tab-id=';

export type RendererSurfaceInfo =
  | { kind: 'window-shell'; tabId: null }
  | { kind: 'native-tab'; tabId: string };

function windowShellSurface(): RendererSurfaceInfo {
  return { kind: 'window-shell', tabId: null };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * preload가 노출한 값을 신뢰하지 않고 fail-closed 방식으로 정규화한다.
 * native-tab에는 반드시 main이 발급한 tabId가 함께 있어야 한다.
 */
export function normalizeRendererSurface(value: unknown): RendererSurfaceInfo {
  if (!value || typeof value !== 'object') return windowShellSurface();

  const candidate = value as { kind?: unknown; tabId?: unknown };
  if (candidate.kind !== 'native-tab' || !nonEmptyString(candidate.tabId)) {
    return windowShellSurface();
  }

  return { kind: 'native-tab', tabId: candidate.tabId };
}

/** Electron additionalArguments에서 renderer 역할을 판별하는 순수 함수. */
export function parseRendererSurfaceArguments(
  argv: readonly string[],
): RendererSurfaceInfo {
  const kind = argv
    .find((argument) => argument.startsWith(RENDERER_SURFACE_ARGUMENT))
    ?.slice(RENDERER_SURFACE_ARGUMENT.length);
  const tabId = argv
    .find((argument) => argument.startsWith(RENDERER_TAB_ID_ARGUMENT))
    ?.slice(RENDERER_TAB_ID_ARGUMENT.length);

  return normalizeRendererSurface({ kind, tabId });
}

/** dev/file hash와 packaged custom-protocol search 양쪽의 window marker를 읽는다. */
export function hasDetachedWindowMarker(search: string, hash: string): boolean {
  if (new URLSearchParams(search).get('window') === 'detached') return true;
  const hashQuery = hash.startsWith('#?') ? hash.slice(2) : '';
  return new URLSearchParams(hashQuery).get('window') === 'detached';
}
