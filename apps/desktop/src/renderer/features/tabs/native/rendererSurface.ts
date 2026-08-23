import {
  normalizeRendererSurface,
  type RendererSurfaceInfo,
} from '../../../../common/rendererSurface';

interface BridgeWithSurface {
  surface?: unknown;
}

const SURFACE_SEARCH_KEY = '__estate_surface';
const TAB_ID_SEARCH_KEY = '__estate_tab_id';

/**
 * preload 값이 정식 seam이다. URL search는 브라우저 단독 개발/테스트용 adapter다.
 */
export function resolveRendererSurface(
  bridge: unknown,
  locationSearch = '',
): RendererSurfaceInfo {
  const exposedSurface = (bridge as BridgeWithSurface | null | undefined)
    ?.surface;
  if (exposedSurface !== undefined) {
    return normalizeRendererSurface(exposedSurface);
  }

  const search = new URLSearchParams(locationSearch);
  return normalizeRendererSurface({
    kind: search.get(SURFACE_SEARCH_KEY),
    tabId: search.get(TAB_ID_SEARCH_KEY),
  });
}

export function getRendererSurface(): RendererSurfaceInfo {
  if (typeof window === 'undefined') {
    return { kind: 'window-shell', tabId: null };
  }

  return resolveRendererSurface(window.electronBridge, window.location.search);
}
