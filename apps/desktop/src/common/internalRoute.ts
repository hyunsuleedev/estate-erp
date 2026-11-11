/**
 * 앱 안의 주소인지 가린다. 주소는 탭 화면에 그대로 실려 preload가 붙은 문서로 열리므로,
 * 다른 호스트로 해석될 수 있는 모양은 한 곳에서 같은 기준으로 막는다.
 *
 * URL 해석 규칙에서 `\`는 `/`와 같고, 탭·줄바꿈 문자는 지워진다. 그래서 `/\host`나
 * `/<TAB>/host`는 `//host`가 되어 다른 호스트를 가리킨다. `/`로 시작하는 것만 보고
 * 받으면 그런 값이 통과한다.
 */
export const MAX_INTERNAL_ROUTE_LENGTH = 4_096;

// 제어 문자(0x00–0x1F, 0x7F). 줄바꿈·탭은 URL 해석 때 지워져 '//'를 만들 수 있다.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function isInternalRoute(
  value: unknown,
  maxLength: number = MAX_INTERNAL_ROUTE_LENGTH,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !CONTROL_CHARACTERS.test(value)
  );
}

/**
 * 주소를 기준 주소 아래의 URL로 바꾼다. 결과가 기준과 다른 출처(origin)면 null이다.
 * 위 검사를 통과한 값만 넘어와야 하지만, 문서를 여는 자리에서는 한 번 더 확인한다.
 */
export function resolveInternalUrl(route: string, baseUrl: string): string | null {
  if (!isInternalRoute(route)) return null;
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(route, base);
    return resolved.origin === base.origin && resolved.protocol === base.protocol
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
}
